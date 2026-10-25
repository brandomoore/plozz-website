#!/usr/bin/env node
/**
 * Builds the responsive screenshot ladders in public/screenshots/ from the
 * pristine masters in screenshots-src/.
 *
 * Every published screenshot ships as three things:
 *
 *   plozz-tv-home-800.avif   <- primary, what almost everyone gets
 *   plozz-tv-home-800.webp   <- fallback for browsers without AVIF
 *   plozz-tv-home.webp       <- full-width fallback for the bare <img src>
 *
 * Encoder settings were picked by measuring DSSIM against the master rather
 * than by eye. At 1400px, AVIF q85 -s 2 --yuv 444 scores *better* than the
 * cwebp -q 95 -sharp_yuv encode the site used to ship, for 35-40% fewer bytes:
 *
 *   plozz-tv-featured    webp q95  212 KB  DSSIM 0.00975
 *                        avif q85  127 KB  DSSIM 0.00869   <- better and smaller
 *   plozz-tv-subtitles   webp q95  162 KB  DSSIM 0.00588
 *                        avif q85  105 KB  DSSIM 0.00482   <- better and smaller
 *
 * --yuv 444 matters for the same reason -sharp_yuv did: these frames are full
 * of small UI text, which is exactly what chroma subsampling smears.
 *
 * Widths are per-image, driven by LADDERS below, because the contexts differ by
 * a lot -- a marquee tile is never wider than 540 CSS px, while the hero fills
 * a 1148px container. Generating 2000px variants for the marquee would be dead
 * weight in the repo that no browser would ever request.
 *
 * Usage:  node tools/build-images.mjs [--force] [--only <name>]
 */

import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { validateMasters } from './screenshot-provenance.mjs';

const run = promisify(execFile);

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'screenshots-src');
const OUT_DIR = path.join(ROOT, 'public', 'screenshots');

/**
 * Encoder settings, chosen by the DSSIM sweep described above.
 *
 * The WebP rungs are only ever served to browsers without AVIF (Safari < 16.4
 * and friends, ~5% of traffic), so they are kept at effectively the same
 * quality the site shipped before this change. Dropping them to q90 would have
 * saved bytes on that path but measured *worse* than the old encode, and the
 * point of this work was to make images better everywhere, not to trade one
 * audience against another.
 */
const AVIF = { quality: 85, speed: 2 };
const WEBP = { quality: 94 };

/**
 * Display contexts as a width ladder, sized from measurements taken in a real
 * browser (src/data/imageSizes.ts records the painted width at each viewport)
 * and doubled for retina.
 *
 *   hero             paints up to 1148 CSS px, so 2x wants 2296, which the
 *                    3840px masters now actually cover
 *   figure           peaks at 796 CSS px at the 900px breakpoint, so 1600 at 2x
 *   frame            the iPad mockup paints 463 CSS px, the iPhone one 136
 *   marquee          landscape tiles peak at 532 CSS px, so ~1080 at 2x
 *   marqueePortrait  tall tiles peak at 139 CSS px, so ~420 covers 3x
 *   thumb            the spoiler card's thumbnail peaks at 410 CSS px
 *
 * Deriving these from the stylesheet instead of measuring is how the iPad
 * mockup ended up at a third of the resolution it needed: it is scaled by
 * transform inside a sized slot, so the frame width in device-frames.css says
 * nothing useful about what actually gets painted.
 *
 * Nothing is emitted above a context's 2-3x width. A 2000px rung for a tile
 * that can never render wider than 532 CSS px is dead weight in the repo that
 * no browser would ever request.
 */
const LADDERS = {
  hero: [768, 1152, 1660, 2296],
  figure: [480, 700, 1000, 1300, 1600],
  frame: [280, 440, 700, 940, 1400],
  marquee: [360, 560, 800, 1080],
  marqueePortrait: [140, 220, 300, 420],
  thumb: [280, 440, 620, 840, 1240],
};

/**
 * Which ladder each master belongs to. An image used in more than one place
 * gets the union of its ladders, so the browser always has a rung close to the
 * size it actually needs.
 */
const USAGE = {
  'plozz-demo-tv-home': ['hero', 'marquee'],
  'plozz-demo-tv-resume': ['hero', 'marquee', 'thumb'],
  'plozz-demo-tv-player': ['hero', 'figure', 'marquee'],
  'plozz-demo-tv-library': ['hero', 'marquee'],
  'plozz-demo-tv-subtitles': ['marquee', 'figure'],
  'plozz-demo-ipad-home': ['marquee', 'frame'],
  'plozz-demo-iphone-home': ['marqueePortrait'],
  'plozz-demo-iphone-library': ['marqueePortrait', 'frame'],
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex === -1 ? null : args[onlyIndex + 1];

async function probe(file) {
  const { stdout } = await run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]);
  const width = Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1]);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(stdout)?.[1]);
  if (!width || !height) throw new Error(`Could not read dimensions from ${file}`);
  return { width, height };
}

/**
 * The rungs worth emitting for one master.
 *
 * The top rung is the smaller of the master's native width and the widest 2x
 * size any of its contexts can actually render at -- there is no point shipping
 * a 2000px marquee tile that tops out at 540 CSS px. Rungs within 12% of each
 * other are collapsed, because the byte difference is not worth an extra file
 * or an extra srcset candidate for the browser to weigh.
 */
function widthsFor(name, nativeWidth) {
  const ladders = USAGE[name] ?? ['figure'];
  const ceiling = Math.max(...ladders.map((ladder) => Math.max(...LADDERS[ladder])));
  const top = Math.min(nativeWidth, ceiling);

  const wanted = new Set([top]);
  for (const ladder of ladders) {
    for (const width of LADDERS[ladder]) {
      if (width < top) wanted.add(width);
    }
  }

  const sorted = [...wanted].sort((a, b) => a - b);
  const kept = [];
  for (const width of sorted) {
    const previous = kept[kept.length - 1];
    if (previous && width / previous < 1.12) kept[kept.length - 1] = width;
    else kept.push(width);
  }
  return kept;
}

/**
 * Build-input fingerprint for one rung: the master's bytes, the width, and the
 * exact encoder settings. It goes in the filename, which is what lets
 * public/_headers serve these as `immutable` honestly.
 *
 * Without it the URLs would be mutable — re-shooting a master or changing a
 * quality setting rewrites the same path with different bytes, and a visitor
 * holding a year-long cached copy would never see the new one. Hashing the
 * inputs means any such change lands on a new URL instead.
 */
function rungHash(masterBytes, width, recipe) {
  return createHash('sha256')
    .update(masterBytes)
    .update(`|${width}|${recipe}`)
    .digest('hex')
    .slice(0, 8);
}

const AVIF_RECIPE = `avif-q${AVIF.quality}-s${AVIF.speed}-yuv444`;
const WEBP_RECIPE = `webp-q${WEBP.quality}-m6-sharpyuv`;

/**
 * Each rung is resized from the master by ImageMagick into a temporary PNG, so
 * every encode starts from pristine pixels rather than downscaling an
 * already-lossy WebP.
 *
 * Anything already on disk under the right hashed name is by definition current
 * — the name covers the master, the width and the settings — so it is skipped.
 */
async function encodeRung({ master, masterBytes, width, isNative, name, tmpDir }) {
  const avifName = `${name}-${width}.${rungHash(masterBytes, width, AVIF_RECIPE)}.avif`;
  const webpName = `${name}-${width}.${rungHash(masterBytes, width, WEBP_RECIPE)}.webp`;
  const avifOut = path.join(OUT_DIR, avifName);
  const webpOut = path.join(OUT_DIR, webpName);

  const needAvif = force || !existsSync(avifOut);
  const needWebp = force || !existsSync(webpOut);

  if (!needAvif && !needWebp) {
    return { avif: avifName, webp: webpName, skipped: true };
  }

  const resized = path.join(tmpDir, `${name}-${width}.png`);
  if (isNative) {
    await run('magick', [master, '-colorspace', 'sRGB', '-depth', '8', resized]);
  } else {
    await run('magick', [
      master,
      '-colorspace', 'sRGB',
      '-filter', 'Lanczos',
      '-resize', `${width}x`,
      '-depth', '8',
      resized,
    ]);
  }

  await Promise.all([
    needAvif
      ? run('avifenc', [
          '-q', String(AVIF.quality),
          '-s', String(AVIF.speed),
          '--yuv', '444',
          resized,
          avifOut,
        ])
      : Promise.resolve(),
    needWebp
      ? run('cwebp', [
          '-q', String(WEBP.quality),
          '-m', '6',
          '-sharp_yuv',
          '-quiet',
          resized,
          '-o', webpOut,
        ])
      : Promise.resolve(),
  ]);

  await rm(resized, { force: true });
  return { avif: avifName, webp: webpName, skipped: false };
}

const MANIFEST_PATH = path.join(ROOT, 'src', 'data', 'screenshots.json');

async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function main() {
  validateMasters();
  await mkdir(OUT_DIR, { recursive: true });
  const tmpDir = path.join(os.tmpdir(), `plozz-img-${process.pid}`);
  await mkdir(tmpDir, { recursive: true });

  const entries = (await readdir(SRC_DIR)).filter((file) => /\.(png|jpe?g)$/i.test(file));

  // A partial run must not drop the other images from the manifest, or every
  // Shot that is not being rebuilt throws and the site stops building.
  const manifest = only ? await readManifest() : {};
  let written = 0;
  let skipped = 0;

  for (const entry of entries.sort()) {
    const name = entry.replace(/\.(png|jpe?g)$/i, '');
    if (!Object.hasOwn(USAGE, name)) throw new Error(`Define the reviewed display contexts for ${name} before encoding.`);
    if (only && name !== only) continue;

    const master = path.join(SRC_DIR, entry);
    const masterBytes = await readFile(master);
    const { width: nativeWidth, height: nativeHeight } = await probe(master);
    const widths = widthsFor(name, nativeWidth);
    const top = widths[widths.length - 1];

    const rungs = [];
    for (const width of widths) {
      const { avif, webp, skipped: wasSkipped } = await encodeRung({
        master,
        masterBytes,
        width,
        isNative: width === nativeWidth,
        name,
        tmpDir,
      });
      rungs.push({
        w: width, avif, webp,
        avifSha256: createHash('sha256').update(await readFile(path.join(OUT_DIR, avif))).digest('hex'),
        webpSha256: createHash('sha256').update(await readFile(path.join(OUT_DIR, webp))).digest('hex'),
      });
      if (wasSkipped) skipped += 1;
      else written += 1;
    }

    manifest[name] = {
      // Intrinsic size of the widest rung. The <img> carries these so the box
      // is reserved before a byte of image arrives, which is what keeps CLS at
      // zero on a slow connection.
      width: top,
      height: Math.round((nativeHeight / nativeWidth) * top),
      rungs,
    };
    process.stdout.write(
      `  ${name.padEnd(22)} master ${String(nativeWidth).padStart(4)}px  ->  ${widths.join(', ')}\n`
    );
  }

  /*
   * Sweep up anything that is no longer referenced: rungs from a previous
   * ladder, and the pre-hash filenames. Without this, changing a ladder leaves
   * stale files behind that still get deployed — and, being served immutable,
   * cached for a year.
   */
  const wanted = new Set();
  for (const entry of Object.values(manifest)) {
    for (const rung of entry.rungs) {
      wanted.add(rung.avif);
      wanted.add(rung.webp);
    }
  }

  const prunable = only
    ? new RegExp(`^${only.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\.`)
    : /\.(avif|webp)$/i;

  let pruned = 0;
  for (const file of await readdir(OUT_DIR)) {
    if (wanted.has(file)) continue;
    if (!prunable.test(file)) continue;
    await rm(path.join(OUT_DIR, file), { force: true });
    pruned += 1;
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  await rm(tmpDir, { recursive: true, force: true });
  console.log(
    `\nEncoded ${written} rung(s), ${skipped} already current, pruned ${pruned} stale file(s).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
