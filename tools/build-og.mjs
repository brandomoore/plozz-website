#!/usr/bin/env node
/**
 * Builds public/og-image.svg and public/og-image.png — the card every link
 * unfurl shows in Slack, iMessage, X, LinkedIn and Discord.
 *
 * This exists because the card drifted. It was hand-rendered once and then
 * only ever patched by hand, so it went on claiming "Native Jellyfin & Plex
 * client for Apple TV / tvOS" long after the app grew Emby, network shares,
 * and iPhone and iPad builds. The SVG beside it drifted differently again and
 * ended up sharing neither the artwork nor the words with the PNG shipped next
 * to it.
 *
 * So both files are outputs now. The TV mark and the wordmark are read from
 * the same public/logo.svg and public/plozz-wordmark.svg the site itself uses,
 * which means changing the logo can no longer leave a stale one in the share
 * card. The words live in COPY below, next to the note about what the site
 * actually claims, so updating them is one edit rather than an image job.
 *
 * Usage:  node tools/build-og.mjs [--check]
 *
 * --check re-renders into a temp file and fails if it differs from what is
 * committed, which is how CI can catch a logo change that skipped this script.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

/**
 * Keep in step with the default title and description in
 * src/layouts/Layout.astro. Every source the site sells, and every device it
 * runs on — a card that names a subset reads as a smaller app than it is.
 */
const COPY = {
  headline: 'Jellyfin, Plex, Emby, Silo & network shares',
  sub: 'Apple TV · iPhone · iPad — free & open source',
};

const escapeXml = (text) => text
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Pulls the drawing out of a source SVG so it can be nested inside the card
 * without its own width, height or xmlns fighting the parent document. The
 * viewBox comes back too, because the transform that places it has to know
 * what coordinate space the paths were drawn in.
 */
function extractArtwork(file) {
  const svg = readFileSync(join(PUBLIC, file), 'utf8');
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  if (!viewBox) throw new Error(`${file} has no viewBox — cannot place it on the card.`);

  const body = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .trim();

  const [, , vbWidth, vbHeight] = viewBox.split(/[\s,]+/).map(Number);
  return { body, viewBox, vbWidth, vbHeight };
}

/**
 * Both marks carry an id (the TV mark clips itself against one). Two copies of
 * the same id in one document would have the second silently lose, so each
 * gets a prefix as it is inlined.
 */
function namespaceIds(body, prefix) {
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  let out = body;
  for (const id of ids) {
    out = out
      .replaceAll(`id="${id}"`, `id="${prefix}-${id}"`)
      .replaceAll(`url(#${id})`, `url(#${prefix}-${id})`)
      .replaceAll(`href="#${id}"`, `href="#${prefix}-${id}"`);
  }
  return out;
}

/** Places a mark at a target width, centred on x, with its top edge at y. */
function place(art, { centerX, top, width }) {
  const scale = width / art.vbWidth;
  return `<g transform="translate(${centerX - width / 2} ${top}) scale(${scale})">${art.body}</g>`;
}

const tv = extractArtwork('logo.svg');
const wordmark = extractArtwork('plozz-wordmark.svg');

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Plozz — ${escapeXml(COPY.headline)}">
  <title>Plozz — ${escapeXml(COPY.headline)}</title>
  <defs>
    <radialGradient id="og-glow" cx="50%" cy="18%" r="62%">
      <stop offset="0%" stop-color="#00a4dc" stop-opacity="0.34"/>
      <stop offset="65%" stop-color="#00a4dc" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0c10"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#og-glow)"/>
${place({ ...tv, body: namespaceIds(tv.body, 'tv') }, { centerX: 600, top: 74, width: 170 })}
${place({ ...wordmark, body: namespaceIds(wordmark.body, 'wm') }, { centerX: 600, top: 292, width: 216 })}
  <text x="600" y="470" text-anchor="middle" fill="#e8edf4" font-family="${FONT}" font-size="44" font-weight="700" letter-spacing="-1">${escapeXml(COPY.headline)}</text>
  <text x="600" y="532" text-anchor="middle" fill="#41c6f5" font-family="${FONT}" font-size="29" font-weight="600" letter-spacing="0.4">${escapeXml(COPY.sub)}</text>
</svg>
`;

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].find((path) => {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
});

/**
 * Rendered through a browser rather than a standalone rasteriser because the
 * card sets its type in the system UI font. librsvg and ImageMagick both
 * resolve -apple-system to a default serif, which silently changes the
 * typeface rather than failing loudly.
 */
async function rasterise(svgMarkup, outPng) {
  if (!CHROME) throw new Error('No Chrome, Chromium or Edge found to rasterise the card.');

  const work = mkdtempSync(join(tmpdir(), 'plozz-og-'));
  const profile = join(work, 'profile');
  let browser;
  let exited;
  let launchError;
  let cancelled = false;
  const cancel = () => { cancelled = true; };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const page = join(work, 'card.html');
    const image = join(work, 'card.png');
    writeFileSync(
      page,
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#0a0c10}</style>${svgMarkup}`,
    );
    console.log(`Rendering with an isolated browser profile: ${profile}`);
    browser = spawn(CHROME, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      '--force-device-scale-factor=1',
      `--window-size=${WIDTH},${HEIGHT}`,
      `--screenshot=${image}`,
      `file://${page}`,
    ], { stdio: 'ignore' });
    console.log(`Render browser PID ${browser.pid}`);
    exited = new Promise((resolve) => {
      browser.once('exit', resolve);
      browser.once('error', (error) => {
        launchError = error;
        resolve();
      });
    });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (cancelled) throw new Error('Card rendering cancelled.');
      if (launchError) throw launchError;
      if (existsSync(image)) {
        const png = readFileSync(image);
        // Chrome can linger after capturing. Wait for a complete PNG, then
        // close only our browser instead of relying on its automatic exit.
        if (png.length > 32 && png.subarray(-8, -4).toString() === 'IEND') {
          if (png.readUInt32BE(16) !== WIDTH || png.readUInt32BE(20) !== HEIGHT) {
            throw new Error('Card rendering produced the wrong dimensions.');
          }
          writeFileSync(outPng, png);
          return;
        }
      }
      if (browser.exitCode !== null || browser.signalCode !== null) {
        throw new Error(`Browser exited before rendering (${browser.exitCode ?? browser.signalCode}).`);
      }
      await delay(100);
    }
    throw new Error('Card rendering timed out after 60 seconds.');
  } finally {
    if (browser?.pid && browser.exitCode === null && browser.signalCode === null) {
      browser.kill('SIGTERM');
      await Promise.race([exited, delay(5_000)]);
      if (browser.exitCode === null && browser.signalCode === null) {
        browser.kill('SIGKILL');
        await exited;
      }
    }
    if (browser?.pid) console.log(`Closed render browser PID ${browser.pid}.`);
    rmSync(work, { recursive: true, force: true });
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}

const check = process.argv.includes('--check');

if (check) {
  const work = mkdtempSync(join(tmpdir(), 'plozz-og-check-'));
  try {
    const candidate = join(work, 'og-image.png');
    await rasterise(svg, candidate);
    const svgMatches = readFileSync(join(PUBLIC, 'og-image.svg'), 'utf8') === svg;
    const pngMatches = readFileSync(candidate).equals(readFileSync(join(PUBLIC, 'og-image.png')));
    if (svgMatches && pngMatches) {
      console.log('og-image is up to date.');
    } else {
      console.error('og-image is stale — run `npm run og`.');
      process.exitCode = 1;
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
} else {
  writeFileSync(join(PUBLIC, 'og-image.svg'), svg);
  await rasterise(svg, join(PUBLIC, 'og-image.png'));
  console.log(`Wrote public/og-image.svg and public/og-image.png (${WIDTH}x${HEIGHT}).`);
}
