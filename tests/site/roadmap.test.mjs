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
  assert.doesNotMatch(page, /Tracked, not promised|Backlog isn’t a promise\. Planned work is chosen by Brandon/);
  assert.doesNotMatch(page, /"generated_at"\s*:|github.com\/brandomoore\/Plozz\/issues\/\d+/);
  assert.match(readFileSync(new URL("../../dist/index.html", import.meta.url), "utf8"), /href="\/roadmap"/);
  assert.match(readFileSync(new URL("../../dist/sitemap-0.xml", import.meta.url), "utf8"), /https:\/\/plozz.app\/roadmap\//);
});

test("roadmap type filters provide distinct, accessible icons reusable by cards", () => {
  for (const [kind, icon, label] of [["bug", "bug", "Bugs"], ["feature", "lightbulb", "Features"]]) {
    const svg = page.match(new RegExp(`<svg[^>]*data-kind-icon="${kind}"[^>]*>[\\s\\S]*?<\\/svg>`))?.[0];
    assert.ok(svg, `Missing ${kind} icon`);
    assert.match(svg, new RegExp(`data-icon="ph:${icon}"`));
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /focusable="false"/);
    assert.match(svg, /<path /);
    assert.doesNotMatch(svg, /<(?:use|symbol)\b|\bid=/);
    assert.match(page, new RegExp(`value="${kind}"[^>]*>[\\s\\S]*?${label}\\s*<\\/span>`));
  }
});
