#!/usr/bin/env node
/** Import a reviewed capture set, never a personal library or an implicit sibling checkout. */
import { readdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { validateMasters } from './screenshot-provenance.mjs';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const from = args.indexOf('--from');
assert(from >= 0 && args[from + 1] && !args[from + 1].startsWith('--'), 'Pass --from with an explicitly reviewed capture directory.');
assert(args.every((arg, index) => arg === '--from' || index === from + 1 || arg === '--dry-run'), 'Supported arguments: --from DIR [--dry-run]');
const source = resolve(args[from + 1]);
const record = validateMasters(root, source);
const files = new Set(record.screenshots.map(image => `${image.name}.png`));
const destination = resolve(root, 'screenshots-src');
assert.deepEqual((await readdir(destination)).filter(file => /\.(png|jpe?g)$/i.test(file)).sort(), [...files].sort(), 'A changed capture set needs explicit usage/layout review before import');
if (args.includes('--dry-run')) {
  console.log(`Validated ${files.size} reviewed captures; no files changed.`);
} else {
  for (const file of files) await copyFile(resolve(source, file), resolve(destination, file));
  const inventory = record.schemaVersion === 1 ? 'demo-media.json' : 'media-credits.json';
  for (const file of ['provenance.json', inventory, 'capture-bootstrap.patch']) {
    await copyFile(resolve(source, file), resolve(destination, file));
  }
  execFileSync(process.execPath, [resolve(root, 'tools/build-images.mjs')], { cwd: root, stdio: 'inherit' });
}
