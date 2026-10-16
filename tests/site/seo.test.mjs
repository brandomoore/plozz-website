import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// This suite runs through test:site, after Astro has rendered the HTML.
const built = (path) => readFileSync(new URL(`../../dist/${path}`, import.meta.url), 'utf8');
const landing = built('infuse-alternative/index.html');
const comparisons = built('apple-tv-media-players/index.html');
const formats = built('formats/index.html');
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
  for (const html of [home, landing, comparisons, formats]) {
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
  assert(home.slice(0, home.indexOf('class="hero-summary"')).includes('TrueHD Atmos and DTS:X height audio on supported Apple TV setups.'));
  assert.match(metadata(home, 'description'), /TrueHD Atmos and DTS:X height channels/);
  assert.match(metadata(formats, 'description'), /TrueHD Atmos and DTS:X/);
  const software = structured(home).find((item) => item['@type'] === 'SoftwareApplication');
  assert(software.featureList.some((item) => item.includes('TrueHD Atmos and DTS:X height-channel rendering')));
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
