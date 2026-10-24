#!/usr/bin/env node
/** Import a reviewed capture set, never a personal library or an implicit sibling checkout. */
import { readFile, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const from = args.indexOf('--from');
assert(from >= 0 && args[from + 1] && !args[from + 1].startsWith('--'), 'Pass --from with an explicitly reviewed capture directory.');
assert(args.every((arg, index) => arg === '--from' || index === from + 1 || arg === '--dry-run'), 'Supported arguments: --from DIR [--dry-run]');
const source = resolve(args[from + 1]);
const record = JSON.parse(await readFile(resolve(source, 'provenance.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(record.schemaVersion, 1);
assert.equal(record.mediaOrigin, 'original-procedural');
assert.equal(record.onlineMetadata, false);
assert.equal(record.generator, 'tools/build-demo-library.py');
assert.equal(record.generatorSha256, hash(await readFile(resolve(root, record.generator))), 'Generator does not match reviewed capture evidence');
for (const [file, key] of [['demo-media.json', 'mediaInventorySha256'], ['capture-bootstrap.patch', 'captureBootstrapSha256']]) {
  assert.equal(hash(await readFile(resolve(source, file))), record[key], `Changed capture evidence: ${file}`);
}
assert(Array.isArray(record.screenshots) && record.screenshots.length);
const files = new Set();
for (const image of record.screenshots) {
  assert.match(image.name, /^plozz-demo-[a-z0-9-]+$/);
  assert.equal(image.reviewed, true);
  assert.equal(image.method, 'simctl-framebuffer');
  const file = `${image.name}.png`;
  assert(!files.has(file), 'Duplicate capture');
  files.add(file);
  const bytes = await readFile(resolve(source, file));
  assert.equal(hash(bytes), image.sha256, `Unreviewed bytes: ${file}`);
  assert.equal(bytes.readUInt32BE(16), image.width, `Wrong width: ${file}`);
  assert.equal(bytes.readUInt32BE(20), image.height, `Wrong height: ${file}`);
}
assert.deepEqual((await readdir(source)).filter(file => /\.(png|jpe?g)$/i.test(file)).sort(), [...files].sort(), 'Unlisted source images');
const destination = resolve(root, 'screenshots-src');
assert.deepEqual((await readdir(destination)).filter(file => /\.(png|jpe?g)$/i.test(file)).sort(), [...files].sort(), 'A changed capture set needs explicit usage/layout review before import');
if (args.includes('--dry-run')) {
  console.log(`Validated ${files.size} reviewed captures; no files changed.`);
} else {
  for (const file of files) await copyFile(resolve(source, file), resolve(destination, file));
  for (const file of ['provenance.json', 'demo-media.json', 'capture-bootstrap.patch']) {
    await copyFile(resolve(source, file), resolve(destination, file));
  }
  execFileSync(process.execPath, [resolve(root, 'tools/build-images.mjs')], { cwd: root, stdio: 'inherit' });
}
