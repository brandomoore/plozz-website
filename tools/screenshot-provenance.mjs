import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = (root, path) => readFileSync(resolve(root, path));
const json = (root, path) => JSON.parse(read(root, path));
const imageName = /^plozz-demo-[a-z0-9-]+$/;
const digest = /^[a-f0-9]{64}$/;

export function validateMasters(root = ROOT, source = resolve(root, 'screenshots-src')) {
  const record = json(source, 'provenance.json');
  assert([1, 2].includes(record.schemaVersion), 'Unknown screenshot provenance schema');
  let mediaIds;
  if (record.schemaVersion === 1) {
    assert.equal(record.generator, 'tools/build-demo-library.py');
    assert.equal(record.generatorSha256, hash(read(root, record.generator)), 'Demo generator changed; review and regenerate screenshot provenance');
    assert.equal(record.mediaOrigin, 'original-procedural');
    assert.equal(record.mediaInventorySha256, hash(read(source, 'demo-media.json')), 'Media inventory changed after review');
  } else {
    assert.equal(record.mediaOrigin, 'reviewed-licensed');
    const inventoryBytes = read(source, 'media-credits.json');
    assert.equal(record.mediaInventorySha256, hash(inventoryBytes), 'Media inventory changed after review');
    const inventory = JSON.parse(inventoryBytes);
    assert.equal(inventory.schemaVersion, 1, 'Unknown media credits schema');
    assert(Array.isArray(inventory.records) && inventory.records.length > 0, 'Missing media credits');
    mediaIds = new Set();
    for (const media of inventory.records) {
      assert.match(media.id, /^[a-z0-9-]+$/);
      assert(!mediaIds.has(media.id), `Duplicate media credit: ${media.id}`);
      mediaIds.add(media.id);
      assert.equal(media.reviewed, true, `Media requires rights review: ${media.id}`);
      for (const field of ['title', 'credit', 'rightsStatement', 'changes']) {
        assert(typeof media[field] === 'string' && media[field].trim(), `Missing ${field}: ${media.id}`);
      }
      assert(['CC BY 4.0', 'CC BY 3.0', 'CC0 1.0', 'Public domain'].includes(media.rights), `Unapproved rights category: ${media.id}`);
      assert(Array.isArray(media.sources) && media.sources.length, `Missing source evidence: ${media.id}`);
      for (const url of media.sources) assert.equal(new URL(url).protocol, 'https:', 'Source evidence must use HTTPS');
      for (const role of ['poster', 'backdrop']) {
        assert.match(media[role].sha256, digest, `Missing artwork hash: ${media.id}/${role}`);
        assert.match(media[role].source_sha256, digest, `Missing source frame hash: ${media.id}/${role}`);
      }
    }
  }
  assert.equal(record.onlineMetadata, false, 'Screenshots must not import unreviewed online artwork');
  assert.match(record.appRevision, /^[a-f0-9]{40}$/);
  assert.match(record.mediaInventorySha256, digest);
  assert.match(record.captureBootstrapSha256, digest);
  assert.equal(record.captureBootstrapSha256, hash(read(source, 'capture-bootstrap.patch')), 'Capture bootstrap changed after review');
  assert(Number.isFinite(Date.parse(record.capturedAt)));
  assert(Array.isArray(record.screenshots) && record.screenshots.length > 0);
  const names = new Set();
  for (const image of record.screenshots) {
    assert.match(image.name, imageName);
    assert(!names.has(image.name), `Duplicate screenshot: ${image.name}`);
    names.add(image.name);
    assert(['tvOS', 'iOS', 'iPadOS'].includes(image.platform));
    assert.equal(image.method, 'simctl-framebuffer');
    assert.equal(image.reviewed, true, `Screenshot requires visual review: ${image.name}`);
    assert(typeof image.request === 'string' && image.request.length > 0);
    if (mediaIds) {
      assert(Array.isArray(image.mediaIds) && image.mediaIds.length, `Missing screenshot media references: ${image.name}`);
      for (const id of image.mediaIds) assert(mediaIds.has(id), `Uncredited screenshot media: ${id}`);
    }
    assert.match(image.sha256, digest);
    const bytes = read(source, `${image.name}.png`);
    assert.equal(hash(bytes), image.sha256, `Unreviewed screenshot bytes: ${image.name}`);
    assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Not PNG: ${image.name}`);
    assert.equal(bytes.readUInt32BE(16), image.width);
    assert.equal(bytes.readUInt32BE(20), image.height);
  }
  const masters = readdirSync(source).filter(file => /\.(png|jpe?g)$/i.test(file)).sort();
  assert.deepEqual(masters, [...names].map(name => `${name}.png`).sort(), 'Unapproved or missing screenshot masters');
  return record;
}

export function validatePublishedScreenshots(root = ROOT) {
  const record = validateMasters(root);
  const manifest = json(root, 'src/data/screenshots.json');
  assert.deepEqual(Object.keys(manifest).sort(), record.screenshots.map(image => image.name).sort(), 'Screenshot manifest differs from approved capture set');
  const expectedFiles = [];
  for (const [name, image] of Object.entries(manifest)) {
    assert(Array.isArray(image.rungs) && image.rungs.length > 0, `Missing sizes: ${name}`);
    for (const rung of image.rungs) {
      for (const type of ['avif', 'webp']) {
        assert.match(rung[type], new RegExp(`^${name}-[0-9]+\\.[a-f0-9]{8}\\.${type}$`));
        assert.match(rung[`${type}Sha256`] ?? '', digest, `Unverified ${type}: ${name}`);
        assert.equal(hash(read(root, `public/screenshots/${rung[type]}`)), rung[`${type}Sha256`], `Changed screenshot derivative: ${rung[type]}`);
        expectedFiles.push(rung[type]);
      }
    }
  }
  assert.deepEqual(readdirSync(resolve(root, 'public/screenshots')).sort(), expectedFiles.sort(), 'Unapproved screenshot files would be deployed');
  return record;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const record = validatePublishedScreenshots();
  console.log(`Verified ${record.screenshots.length} reviewed real-app screenshots and all published derivatives.`);
}
