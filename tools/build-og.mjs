#!/usr/bin/env node
/**
 * Builds public/og-image.svg and public/og-image.png — the card every link
 * unfurl shows in Slack, iMessage, X, LinkedIn and Discord.
 *
 * Uses the site's current logo and bundled Manrope font. Both outputs are
 * self-contained: no remote artwork/font request, old pixel wordmark or glow.
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
 * Match the homepage's headline and supported devices/sources. The image's
 * text alternative lives in src/data/brand.ts.
 */
const COPY = {
  headline: ['Free and open source.', 'Plays practically everything.'],
  media: 'Your movies, shows & IPTV / Live TV.',
  platforms: 'Apple TV · iPhone · iPad',
  sources: 'Jellyfin · Plex · Emby · Silo · Network shares',
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

  return { body, viewBox };
}

const tv = extractArtwork('logo.svg');
const font = readFileSync(join(PUBLIC, 'fonts/manrope-v20-latin.woff2')).toString('base64');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Plozz — ${escapeXml(COPY.headline.join(' '))}">
  <title>Plozz — ${escapeXml(COPY.headline.join(' '))}</title>
  <style>
    @font-face {
      font-family: Manrope;
      font-style: normal;
      font-weight: 400 700;
      src: url(data:font/woff2;base64,${font}) format('woff2');
    }
    text { font-family: Manrope, sans-serif; }
  </style>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#09090b"/>
  <rect x="24" y="24" width="1152" height="582" rx="32" fill="#0b0b0c" stroke="#27272a"/>
  <svg x="76" y="70" width="64" height="64" viewBox="${tv.viewBox}" fill="none" shape-rendering="crispEdges">${tv.body}</svg>
  <text x="154" y="118" fill="#f4f4f5" font-size="34" font-weight="700" letter-spacing="-1">Plozz</text>
  <text x="1120" y="112" text-anchor="end" fill="#a1a1aa" font-size="22" font-weight="500">plozz.app</text>
  <text x="80" y="258" fill="#f4f4f5" font-size="64" font-weight="600" letter-spacing="-2">${escapeXml(COPY.headline[0])}</text>
  <text x="80" y="336" fill="#f4f4f5" font-size="64" font-weight="600" letter-spacing="-2">${escapeXml(COPY.headline[1])}</text>
  <text x="80" y="393" fill="#e4e4e7" font-size="28" font-weight="500" letter-spacing="-0.5">${escapeXml(COPY.media)}</text>
  <path d="M80 436H1120" stroke="#27272a"/>
  <text x="80" y="499" fill="#e4e4e7" font-size="28" font-weight="500" letter-spacing="-0.5">${escapeXml(COPY.platforms)}</text>
  <text x="80" y="546" fill="#a1a1aa" font-size="24" font-weight="400">${escapeXml(COPY.sources)}</text>
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
 * card uses the site's embedded variable WOFF2 font. Browser rendering keeps
 * the typography consistent with the live website.
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
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#09090b}</style>${svgMarkup}`,
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
      '--virtual-time-budget=2000',
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
