import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("../../dist/roadmap/index.html", import.meta.url), "utf8");

test("roadmap is discoverable, semantic and never ships a fabricated snapshot", () => {
  assert.match(page, /<title>Roadmap — Plozz<\/title>/);
  assert.match(page, /rel="canonical" href="https:\/\/plozz.app\/roadmap\/"/);
  assert.match(page, /href="#roadmap"/);
  assert.match(page, /<main id="roadmap"/);
  assert.match(page, /role="search"/);
  assert.match(page, /role="status" aria-live="polite"/);
  assert.equal((page.match(/class="roadmap-column"/g) || []).length, 5);
  for (const stage of ["backlog", "planned", "in-progress", "in-beta", "released"]) {
    assert.match(page, new RegExp(`aria-labelledby="heading-${stage}"`));
    assert.match(page, new RegExp(`data-stage-select="${stage}"`));
  }
  assert.match(page, /<noscript>/);
  assert.doesNotMatch(page, /"generated_at"\s*:|github.com\/brandomoore\/Plozz\/issues\/\d+/);
  assert.match(readFileSync(new URL("../../dist/index.html", import.meta.url), "utf8"), /href="\/roadmap"/);
  assert.match(readFileSync(new URL("../../dist/sitemap-0.xml", import.meta.url), "utf8"), /https:\/\/plozz.app\/roadmap\//);
});
