import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

// This suite runs through test:site, after Astro has rendered the HTML.
const built = (path) => readFileSync(new URL(`../../dist/${path}`, import.meta.url), 'utf8');
const landing = built('infuse-alternative/index.html');
const comparisons = built('apple-tv-media-players/index.html');
const formats = built('formats/index.html');
const liveTv = built('live-tv/index.html');
const home = built('index.html');
const plain = (html) => html
  .replace(/<[^>]+>/g, '')
  .replaceAll('&amp;', '&')
  .replaceAll('&#39;', "'")
  .replaceAll('&quot;', '"')
  .replace(/\s+/g, ' ')
  .trim();
const metadata = (html, key) => {
  const tag = [...html.matchAll(/<meta\b[^>]*>/g)].map(([tag]) => tag)
    .find((tag) => tag.includes(`name="${key}"`) || tag.includes(`property="${key}"`));
  assert(tag, `Missing ${key}`);
  return plain(tag.match(/content="([^"]*)"/)[1]);
};
const structured = (html) => [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  .map(([, json]) => JSON.parse(json));

test('every page uses the current image revision for Open Graph and Twitter', () => {
  const png = readFileSync(new URL('../../public/og-image.png', import.meta.url));
  const revision = createHash('sha256').update(png).digest('hex').slice(0, 16);
  const url = `https://plozz.app/og-image.png?v=${revision}`;
  for (const file of readdirSync(new URL('../../dist/', import.meta.url), { recursive: true }).filter((file) => file.endsWith('.html'))) {
    const html = built(file);
    assert.equal(metadata(html, 'og:image'), url, file);
    assert.equal(metadata(html, 'twitter:image'), url, file);
    assert.equal(metadata(html, 'og:image:type'), 'image/png');
    assert.equal(metadata(html, 'og:image:width'), '1200');
    assert.equal(metadata(html, 'og:image:height'), '630');
    assert.equal(metadata(html, 'og:image:alt'), metadata(html, 'twitter:image:alt'));
    assert.match(metadata(html, 'og:image:alt'), /Free and open source\. Plays practically everything/);
  }
  assert.equal(structured(home).find((item) => item['@type'] === 'SoftwareApplication').image, url);
});

test('social card uses the current mark and bundled Manrope, not the old glow or pixel wordmark', () => {
  const png = readFileSync(new URL('../../public/og-image.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert(png.length < 1_000_000);
  const svg = readFileSync(new URL('../../public/og-image.svg', import.meta.url), 'utf8');
  const logo = readFileSync(new URL('../../public/logo.svg', import.meta.url), 'utf8')
    .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  const font = readFileSync(new URL('../../public/fonts/manrope-v20-latin.woff2', import.meta.url)).toString('base64');
  assert(svg.includes(logo), 'Embed the current canonical mark without changing its artwork');
  assert(svg.includes(`data:font/woff2;base64,${font}`));
  assert.match(svg, /font-family: Manrope/);
  assert.doesNotMatch(svg, /radialGradient|og-glow|plozz-wordmark/);
  for (const text of ['Free and open source.', 'Plays practically everything.', 'IPTV / Live TV', 'Apple TV', 'iPhone', 'iPad', 'Jellyfin', 'Plex', 'Emby', 'Silo', 'Network shares']) {
    assert(svg.includes(text), `Missing social-card copy: ${text}`);
  }
});

test('website marks and favicons share the current canonical logo revision', () => {
  const logo = readFileSync(new URL('../../public/logo.svg', import.meta.url));
  const revision = createHash('sha256').update(logo).digest('hex').slice(0, 16);
  const path = `/logo.svg?v=${revision}`;
  for (const file of readdirSync(new URL('../../dist/', import.meta.url), { recursive: true }).filter((file) => file.endsWith('.html'))) {
    const html = built(file);
    const icon = [...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) => tag).find((tag) => tag.includes('rel="icon"'));
    assert(icon?.includes(`href="${path}"`), file);
    const marks = [...html.matchAll(/<img\b[^>]*src="(\/logo\.svg[^"]*)"[^>]*>/g)];
    assert(marks.length >= 2, `${file}: expected page branding and footer mark`);
    assert(marks.every(([, src]) => src === path), `${file}: stale logo URL`);
  }
});

test('alternative landing page is indexable with focused, consistent search and social metadata', () => {
  const title = plain(landing.match(/<title>([\s\S]*?)<\/title>/)[1]);
  assert.equal(title, 'Free, open-source Infuse alternative for Apple TV — Plozz');
  assert.equal(metadata(landing, 'og:title'), title);
  assert.equal(metadata(landing, 'twitter:title'), title);
  assert.match(metadata(landing, 'description'), /free Infuse alternative.*open-source Apple TV/);
  assert.equal(metadata(landing, 'og:description'), metadata(landing, 'description'));
  assert.equal(metadata(landing, 'twitter:description'), metadata(landing, 'description'));
  assert.match(landing, /<link rel="canonical" href="https:\/\/plozz\.app\/infuse-alternative\/"/);
  assert.match(metadata(landing, 'robots'), /^index, follow/);
  assert.equal(metadata(landing, 'og:url'), 'https://plozz.app/infuse-alternative/');
  const headings = [...landing.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(headings.length, 1);
  assert.equal(plain(headings[0][1]), 'A free, open-source Infuse alternative.');
});

test('visible FAQ answers and structured data stay identical on home and comparison pages', () => {
  for (const html of [home, landing, comparisons, formats, liveTv]) {
    const faq = structured(html).find((item) => item['@type'] === 'FAQPage');
    assert(faq);
    const details = [...html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)];
    assert.equal(faq.mainEntity.length, details.length);
    for (const [index, [, content]] of details.entries()) {
      assert.equal(plain(content.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)[1]), faq.mainEntity[index].name);
      assert.equal(plain(content.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)[1]), faq.mainEntity[index].acceptedAnswer.text);
    }
  }
});

test('IPTV is prominent in navigation, home sources, social metadata and its own page', () => {
  for (const html of [home, landing, comparisons, formats, liveTv]) {
    assert.match(html.match(/<nav\b[^>]*aria-label="Main navigation"[\s\S]*?<\/nav>/)[0], /href="\/live-tv"/);
    assert.match(metadata(html, 'og:image:alt'), /IPTV \/ Live TV/);
  }
  const hero = home.match(/<section\b[^>]*class="hero"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert(plain(hero).includes('IPTV / Live TV'));
  assert.match(home.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1], /href="\/live-tv"/);
  assert.match(metadata(home, 'description'), /IPTV \/ Live TV/);
  assert.match(liveTv, /<link rel="canonical" href="https:\/\/plozz\.app\/live-tv\/"/);
  assert.equal(metadata(liveTv, 'og:title'), 'Free IPTV & Live TV player for Apple TV — Plozz');
  assert.equal(metadata(liveTv, 'og:description'), metadata(liveTv, 'description'));
  assert.equal(metadata(liveTv, 'twitter:title'), metadata(liveTv, 'og:title'));
  assert.match(built('sitemap-0.xml'), /<loc>https:\/\/plozz\.app\/live-tv\/<\/loc>/);
  const content = plain(liveTv);
  for (const term of ['M3U', 'Xtream', 'XMLTV', 'Multiview', 'four channels', 'Plex', 'Jellyfin', 'Emby', 'Experimental', 'iPhone and iPad', 'does not provide a channel catalog', 'not part of the current Live TV implementation', 'Imported playlist files remain on the importing device']) {
    assert(content.includes(term), `Missing IPTV capability or boundary: ${term}`);
  }
});

test('Apple TV height audio is prominent without repeating the obsolete blanket limitation', () => {
  for (const [route, html] of [
    ['home', home],
    ['features', built('features/index.html')],
    ['formats', formats],
    ['Infuse alternative', landing],
    ['comparisons', comparisons],
    ...['jellyfin', 'plex', 'emby', 'network-shares'].map((route) => [route, built(`${route}/index.html`)]),
  ]) {
    const content = plain(html);
    for (const term of ['TrueHD Atmos', 'DTS:X', 'Apple TV', 'AetherEngine']) {
      assert(content.includes(term), `${route}: missing ${term}`);
    }
    assert.doesNotMatch(content, /TrueHD Atmos loses its object metadata|its object metadata (?:is not preserved|doesn’t survive)|Atmos objects only pass through untouched from E-AC-3/);
  }
  assert.match(home.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1], /href="\/formats#height-channels"/);
  assert(plain(home).includes('Height channels. On Apple TV.'));
  assert.match(metadata(home, 'description'), /TrueHD Atmos and DTS:X height channels/);
  assert.match(metadata(formats, 'description'), /TrueHD Atmos and DTS:X/);
  const software = structured(home).find((item) => item['@type'] === 'SoftwareApplication');
  assert(software.featureList.some((item) => item.includes('TrueHD Atmos and DTS:X height-channel rendering')));
});

test('home hero goes straight from headline to providers and actions', () => {
  const hero = home.match(/<section\b[^>]*class="hero"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.match(hero, /<\/h1>\s*<div class="hero-summary"/);
  assert.doesNotMatch(hero, /href="\/infuse-alternative"|href="\/formats#height-channels"|Movies, shows and music/);
  assert.match(hero, /class="hero-logos"/);
  assert.match(hero, /Join the TestFlight beta/);
  assert(plain(built('features/index.html')).includes('Movies, shows and music on Apple TV, iPhone and iPad.'));
  const faq = structured(home).find((item) => item['@type'] === 'FAQPage');
  assert(faq.mainEntity.some((item) => item.name.includes('alternative to Infuse')));
  assert(faq.mainEntity.some((item) => item.name.includes('TrueHD Atmos and DTS:X')));
});

test('hero offers TestFlight first with GitHub and the stable Discord shortcut as secondary actions', () => {
  const hero = home.match(/<section\b[^>]*class="hero"[^>]*>([\s\S]*?)<\/section>/)[1];
  const links = [...hero.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.deepEqual(links.map(([, attributes, content]) => attributes.match(/aria-label="([^"]+)"/)?.[1] ?? plain(content)), ['Join the TestFlight beta', 'GitHub', 'Discord']);
  assert.equal(links.filter(([, attributes]) => attributes.includes('btn-primary')).length, 1);
  assert.match(links[0][1], /btn-primary/);
  assert.match(links[0][1], /href="https:\/\/testflight\.apple\.com\/join\/EKfReNMu"/);
  assert.match(links[1][1], /btn-light/);
  assert.match(links[1][1], /href="https:\/\/github\.com\/brandomoore\/Plozz"/);
  assert.match(links[2][1], /btn-light/);
  assert.match(links[2][1], /href="https:\/\/plozz\.app\/discord"/);
  assert.match(links[2][1], /target="_blank"/);
  assert.match(links[2][1], /rel="noopener"/);
  assert.match(links[2][2], /<svg\b/);
});

test('all public Discord links use the stable app-owned shortcut', () => {
  for (const file of readdirSync(new URL('../../dist/', import.meta.url), { recursive: true }).filter(file => file.endsWith('.html'))) {
    const html = built(file);
    assert.match(html, /href="https:\/\/plozz\.app\/discord"/, file);
    assert.doesNotMatch(html, /https:\/\/(?:discord\.gg\/|discord\.com\/invite\/)/, `${file}: direct invite must stay in the redirect service only`);
  }
});

test('height-audio details distinguish supported sources, lossy rendering and output', () => {
  assert.match(formats, /id="height-channels"/);
  const content = plain(formats);
  for (const term of [
    'tvOS 26 or later', '48 kHz', 'Apple Positional Audio', 'APAC is lossy',
    'Dolby MAT', 'compatible Atmos receiver', 'not untouched TrueHD or DTS:X passthrough',
    'without heights', 'channel-based', 'supported on-demand video',
  ]) {
    assert(content.includes(term), `Missing height-audio qualification: ${term}`);
  }
  for (const anchor of ['truehd-atmos-with-heights', 'dtsx-with-heights']) {
    assert(formats.includes(`https://github.com/superuser404notfound/AetherEngine/blob/main/docs/formats.md#${anchor}`));
  }
  const faq = structured(formats).find((item) => item['@type'] === 'FAQPage');
  assert(faq.mainEntity.some((entry) => entry.name === 'Does Plozz play DTS:X height channels on Apple TV?'));
  assert(faq.mainEntity.some((entry) => entry.name === 'Is TrueHD Atmos or DTS:X height playback lossless?' && entry.acceptedAnswer.text.startsWith('No.')));
});

test('both comparison pages are connected through content links, footer and sitemap', () => {
  assert.match(home.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1], /href="\/infuse-alternative"/);
  assert.match(home.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1], /href="\/apple-tv-media-players"/);
  assert.match(built('features/index.html').match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1], /href="\/apple-tv-media-players"/);
  assert.match(built('silo/index.html').match(/<footer\b[\s\S]*?<\/footer>/)[0], /href="\/apple-tv-media-players"/);
  assert.match(landing.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1], /href="\/apple-tv-media-players"/);
  assert.match(comparisons.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1], /href="\/infuse-alternative"/);
  for (const path of ['infuse-alternative', 'apple-tv-media-players']) {
    assert(built('sitemap-0.xml').includes(`<loc>https://plozz.app/${path}/</loc>`));
  }
});

test('broader comparisons have their own canonical and consistent search/social metadata', () => {
  const title = plain(comparisons.match(/<title>([\s\S]*?)<\/title>/)[1]);
  assert.equal(title, 'Apple TV media player comparisons — Plozz vs Infuse & more');
  assert.equal(metadata(comparisons, 'og:title'), title);
  assert.equal(metadata(comparisons, 'twitter:title'), title);
  assert.equal(metadata(comparisons, 'description'), metadata(comparisons, 'og:description'));
  assert.equal(metadata(comparisons, 'description'), metadata(comparisons, 'twitter:description'));
  assert.match(metadata(comparisons, 'description'), /Infuse, VLC, Plex, Emby and Swiftfin/);
  assert.match(comparisons, /<link rel="canonical" href="https:\/\/plozz\.app\/apple-tv-media-players\/"/);
  assert.equal(metadata(comparisons, 'og:url'), 'https://plozz.app/apple-tv-media-players/');
  assert.match(metadata(comparisons, 'robots'), /^index, follow/);
  assert.equal([...comparisons.matchAll(/<h1\b/g)].length, 1);
});

test('each app gets a sourced, substantive comparison with Infuse first', () => {
  const apps = [
    ['infuse', 'Infuse', 'https://firecore.com/infuse'],
    ['vlc', 'VLC', 'https://www.videolan.org/vlc/download-appletv.html'],
    ['plex', 'Plex', 'https://www.plex.tv/your-media/'],
    ['emby', 'Emby', 'https://emby.media/emby-for-appletv.html'],
    ['swiftfin', 'Swiftfin', 'https://github.com/jellyfin/Swiftfin'],
  ];
  let lastIndex = -1;
  for (const [id, name, source] of apps) {
    const index = comparisons.indexOf(`id="${id}"`);
    assert(index > lastIndex, `${name} comparison order`);
    lastIndex = index;
    const section = comparisons.slice(index, comparisons.indexOf('</section>', index));
    assert(section.includes(`href="${source}"`));
    const content = plain(section);
    for (const label of [`Plozz vs ${name}`, `When ${name} fits`, 'Why try Plozz', 'Before switching']) {
      assert(content.includes(label), `${name}: ${label}`);
    }
    const descriptions = [...section.matchAll(/<dd\b[^>]*>([\s\S]*?)<\/dd>/g)];
    assert.equal(descriptions.length, 3);
    assert(descriptions.every(([, content]) => plain(content).length > 100));
    assert(comparisons.includes(`href="#${id}"`));
  }
  const content = plain(comparisons);
  assert(content.includes('VLC and Swiftfin are also free and open source.'));
  assert(content.includes('not an independent ranking'));
  assert(content.includes('not affiliated'));
  assert.doesNotMatch(content, /most popular|Plozz is the only free|Infuse Pro|\$\d/i);
});

test('positioning stays factual and retains free/open-source and platform qualifications', () => {
  const content = plain(landing);
  for (const term of ['GPL-3.0', 'no subscription', 'Infuse', 'VLC', 'Plex', 'Emby', 'Jellyfin', 'Silo', 'SMB', 'not affiliated', 'not a replacement media server', 'not an import of your Infuse settings', 'not Apple TV features', 'through TestFlight']) {
    assert(content.includes(term), `Missing qualification or relevant context: ${term}`);
  }
  assert.match(landing, /href="https:\/\/firecore\.com\/infuse"/);
  assert.match(landing, /href="https:\/\/www\.videolan\.org\/vlc\/download-appletv\.html"/);
  assert(content.includes('Infuse is another player for personal media. VLC for Apple TV is also free and open source.'));
  assert.doesNotMatch(content, /Plozz is the only free|better than Infuse|Infuse Pro|\$\d/i);
  assert.equal(structured(landing).some((item) => item.aggregateRating || item.review), false);
  const software = structured(home).find((item) => item['@type'] === 'SoftwareApplication');
  assert.equal(software.isAccessibleForFree, true);
  assert.equal(software.offers.price, '0');
  assert.equal(software.license, 'https://www.gnu.org/licenses/gpl-3.0.html');
});
