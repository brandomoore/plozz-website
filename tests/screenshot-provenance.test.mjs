import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validatePublishedScreenshots } from '../tools/screenshot-provenance.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
test('publication rejects unreviewed captures, changed derivatives and leftover images', t => {
  const root = mkdtempSync(join(tmpdir(), 'plozz-provenance-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['tools', 'screenshots-src', 'src/data', 'public/screenshots']) mkdirSync(join(root, path), { recursive: true });
  const save = (path, value) => writeFileSync(join(root, path), value);
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(1920, 16); png.writeUInt32BE(1080, 20);
  save('tools/build-demo-library.py', 'original geometry');
  save('screenshots-src/demo-media.json', '{}');
  save('screenshots-src/capture-bootstrap.patch', 'capture-only source setup');
  save('screenshots-src/plozz-demo-tv-home.png', png);
  const record = {
    schemaVersion: 1, generator: 'tools/build-demo-library.py', generatorSha256: hash('original geometry'),
    mediaOrigin: 'original-procedural', onlineMetadata: false, appRevision: 'a'.repeat(40),
    mediaInventorySha256: hash('{}'), captureBootstrapSha256: hash('capture-only source setup'), capturedAt: '2026-10-24T00:00:00Z',
    screenshots: [{ name: 'plozz-demo-tv-home', platform: 'tvOS', method: 'simctl-framebuffer', reviewed: true,
      request: 'home', width: 1920, height: 1080, sha256: hash(png) }],
  };
  save('screenshots-src/provenance.json', JSON.stringify(record));
  const rung = { w: 800 };
  for (const type of ['avif', 'webp']) {
    rung[type] = `plozz-demo-tv-home-800.1234abcd.${type}`;
    rung[`${type}Sha256`] = hash(type);
    save(`public/screenshots/${rung[type]}`, type);
  }
  save('src/data/screenshots.json', JSON.stringify({ 'plozz-demo-tv-home': { width: 800, height: 450, rungs: [rung] } }));
  assert.doesNotThrow(() => validatePublishedScreenshots(root));
  save('public/screenshots/old-movie.webp', 'unapproved');
  assert.throws(() => validatePublishedScreenshots(root), /Unapproved screenshot files/);
  rmSync(join(root, 'public/screenshots/old-movie.webp'));
  save(`public/screenshots/${rung.avif}`, 'changed');
  assert.throws(() => validatePublishedScreenshots(root), /Changed screenshot derivative/);
  save(`public/screenshots/${rung.avif}`, 'avif');
  record.screenshots[0].reviewed = false;
  save('screenshots-src/provenance.json', JSON.stringify(record));
  assert.throws(() => validatePublishedScreenshots(root), /requires visual review/);
  record.screenshots[0].reviewed = true;
  save('screenshots-src/provenance.json', JSON.stringify(record));
  save('screenshots-src/plozz-demo-tv-home.png', Buffer.concat([png, Buffer.from('changed')]));
  assert.throws(() => validatePublishedScreenshots(root), /Unreviewed screenshot bytes/);
});
