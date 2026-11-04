import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTHORITY_REVISION, validateFeed, feedAge, selectItems, pageItems, displayTitle, STALE_AFTER_MS, EXPIRES_AFTER_MS, MAX_FEED_BYTES } from "../shared/roadmap.mjs";
import { handleRoadmap, FEED_URL } from "../worker/roadmap.js";
import { publishFeed } from "../tools/publish-roadmap.mjs";
import worker from "../worker/index.js";

const now = Date.parse("2026-11-04T20:30:00Z");
function fixture(time = now) {
  return {
    schema_version: 1,
    generated_at: new Date(time).toISOString().replace(".000Z", "Z"),
    source: {
      repository: "brandomoore/Plozz", revision: "a".repeat(40),
      authority_revision: AUTHORITY_REVISION,
      run_url: "https://github.com/brandomoore/plozz-website/actions/runs/123",
    },
    items: [{
      number: 42, title: "[Bug]: Playback stops", kind: "bug", stage: "backlog",
      github_url: "https://github.com/brandomoore/Plozz/issues/42",
      discord_urls: ["https://discord.com/channels/1527028230106906704/1562104628798038107/1562104628798038107"],
    }],
  };
}

test("strict feed contract accepts all stages, preserves text and rejects untrusted links and fields", () => {
  const feed = fixture();
  assert.equal(validateFeed(feed, now), feed);
  for (const stage of ["backlog", "planned", "in-progress", "in-beta", "released"]) {
    feed.items[0].stage = stage;
    validateFeed(feed, now);
  }
  feed.items[0].title = "<img src=x onerror=alert(1)> & text";
  assert.equal(validateFeed(feed, now).items[0].title, feed.items[0].title);
  for (const mutate of [
    f => { f.schema_version = 2; },
    f => { f.secret = "never publish"; },
    f => { f.items[0].body = "not public feed content"; },
    f => { f.source.authority_revision = "b".repeat(40); },
    f => { f.source.repository = "another/repo"; },
    f => { f.source.revision = "main"; },
    f => { f.generated_at = "2026-02-31T20:00:00Z"; },
    f => { f.generated_at = "2026-11-05T20:30:00Z"; },
    f => { f.items[0].number = true; },
    f => { f.items.push(structuredClone(f.items[0])); },
    f => { f.items[0].stage = "closed"; },
    f => { f.items[0].kind = "enhancement"; },
    f => { f.items[0].github_url = "https://github.com/other/Plozz/issues/42"; },
    f => { f.items[0].discord_urls = ["javascript:alert(1)"]; },
    f => { f.items[0].discord_urls = ["https://discord.com/channels/999/1562104628798038107/1562104628798038107"]; },
    f => { f.items[0].title = ""; },
    f => { f.items[0].title = "secret\nline"; },
    f => { f.items[0].title = "x".repeat(2049); },
    f => { f.items = null; },
  ]) {
    const invalid = fixture();
    mutate(invalid);
    assert.throws(() => validateFeed(invalid, now), /Invalid roadmap feed/);
  }
});

test("freshness uses evidence time, including exact stale/expiry boundaries", () => {
  assert.deepEqual(feedAge(fixture(), now), { stale: false, expired: false });
  assert.equal(feedAge(fixture(now - STALE_AFTER_MS), now).stale, false);
  assert.equal(feedAge(fixture(now - STALE_AFTER_MS - 1000), now).stale, true);
  assert.equal(feedAge(fixture(now - EXPIRES_AFTER_MS), now).expired, false);
  assert.equal(feedAge(fixture(now - EXPIRES_AFTER_MS - 1000), now).expired, true);
});

test("search covers all items, filters compose, and every item is reachable in bounded pages", () => {
  const items = Array.from({ length: 114 }, (_, i) => ({
    ...fixture().items[0], number: i + 1, title: i === 99 ? "SMB playback issue" : `Issue ${i + 1}`,
    kind: i % 2 ? "feature" : "bug",
  }));
  assert.deepEqual(selectItems(items, "smb playback", "feature").map(i => i.number), [100]);
  assert.equal(selectItems(items, "smb", "bug").length, 0);
  assert.deepEqual(selectItems(items, "#114").map(i => i.number), [114]);
  assert.deepEqual(selectItems(items, "#1").map(i => i.number), [1]);
  assert.equal(selectItems(items)[0].number, 114);
  const collected = [];
  for (let page = 0; page < 29; page++) {
    const selected = pageItems(items, page);
    assert(selected.items.length <= 4);
    collected.push(...selected.items.map(i => i.number));
  }
  assert.deepEqual(collected, items.map(i => i.number));
  assert.equal(pageItems(items, 500).page, 28);
  assert.equal(pageItems([], 500).page, 0);
  assert.equal(displayTitle("[Feature]: SMB shares"), "SMB shares");
  assert.equal(displayTitle("[smb] Playback"), "[smb] Playback");
});

function harness(saved) {
  let value = saved;
  const writes = [];
  const pending = [];
  return {
    cache: {
      async match() { return value ? Response.json(value) : undefined; },
      async put(key, response) { writes.push(key); value = await response.json(); },
    },
    writes,
    ctx: { waitUntil(promise) { pending.push(promise); } },
    async settle() { await Promise.all(pending); },
    value() { return value; },
  };
}

test("Worker fetches only fixed public feed, caches without AUTH_KV or credentials", async () => {
  const h = harness();
  let called = 0;
  const fetcher = async (url, options) => {
    called++;
    assert.equal(url, FEED_URL);
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers.Authorization, undefined);
    return Response.json(fixture());
  };
  const request = new Request("https://plozz.app/api/roadmap");
  const first = await handleRoadmap(request, h.ctx, { cache: h.cache, fetcher, now });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).status, "current");
  await h.settle();
  await handleRoadmap(request, h.ctx, { cache: h.cache, fetcher, now: now + 60_000 });
  assert.equal(called, 1);
  assert.equal(h.value().feed.generated_at, fixture().generated_at);
});

test("Worker rejects upstream redirects without following or caching them", async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const h = harness();
    let calls = 0;
    const result = await handleRoadmap(new Request("https://plozz.app/api/roadmap"), h.ctx, {
      cache: h.cache, now,
      fetcher: async (url, options) => {
        calls++;
        assert.equal(url, FEED_URL);
        assert.equal(options.redirect, "manual");
        return new Response(null, { status, headers: { Location: "https://example.com/untrusted" } });
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { error: "roadmap_unavailable" });
    assert.equal(h.writes.length, 0);
  }
});

test("refresh failures retain validated data, never change the verification time", async () => {
  for (const fetcher of [
    async () => { throw new Error("offline"); },
    async () => new Response("limited", { status: 429 }),
    async () => new Response(null, { status: 302, headers: { Location: "https://example.com/untrusted" } }),
    async () => Response.json({ items: [] }),
    async () => Response.json(fixture(now - 2 * STALE_AFTER_MS)),
    async () => new Response("oversized", { headers: { "content-length": String(MAX_FEED_BYTES + 1) } }),
    async () => new Response(new Uint8Array(MAX_FEED_BYTES + 1)),
  ]) {
    const original = fixture(now - STALE_AFTER_MS);
    const h = harness({ feed: original, fetched_at: now - 600_000 });
    const result = await handleRoadmap(new Request("https://plozz.app/api/roadmap"), h.ctx, {
      cache: h.cache, fetcher, now,
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
    const body = await result.json();
    assert.equal(body.status, "delayed");
    assert.deepEqual(body.feed, original);
    assert.equal(h.writes.length, 0);
  }
});

test("missing, corrupt and expired snapshots are errors, never empty successful boards", async () => {
  for (const saved of [
    undefined, { feed: {} },
    { feed: fixture(now - EXPIRES_AFTER_MS - 1000), fetched_at: now },
  ]) {
    const h = harness(saved);
    const result = await handleRoadmap(new Request("https://plozz.app/api/roadmap"), h.ctx, {
      cache: h.cache, fetcher: async () => new Response("not found", { status: 404 }), now,
    });
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { error: "roadmap_unavailable" });
    assert.equal(result.headers.get("cache-control"), "no-store");
  }
});

test("old successful upstream data is labeled delayed; expired upstream data is refused", async () => {
  const h = harness();
  const result = await handleRoadmap(new Request("https://plozz.app/api/roadmap"), h.ctx, {
    cache: h.cache, fetcher: async () => Response.json(fixture(now - STALE_AFTER_MS - 1000)), now,
  });
  assert.equal((await result.json()).status, "delayed");
  const expired = await handleRoadmap(new Request("https://plozz.app/api/roadmap"), {}, {
    fetcher: async () => Response.json(fixture(now - EXPIRES_AFTER_MS - 1000)), cache: undefined, now,
  });
  assert.equal(expired.status, 503);
});

test("roadmap router rejects writes and does not touch OAuth or asset bindings", async () => {
  const result = await worker.fetch(new Request("https://plozz.app/api/roadmap/", { method: "POST" }), {}, {});
  assert.equal(result.status, 405);
  assert.equal(result.headers.get("allow"), "GET");
});

test("publisher validates before network and only updates the isolated data ref without force", async () => {
  let calls = [];
  const fetcher = async (url, options) => {
    const body = options.body && JSON.parse(options.body);
    calls.push({ url, options, body });
    if (url.endsWith("/git/ref/heads/roadmap-data")) {
      return Response.json({ object: { sha: calls.length === 1 ? "old" : "commit" } });
    }
    if (url.endsWith("/git/blobs")) return Response.json({ sha: "blob" });
    if (url.endsWith("/git/trees")) return Response.json({ sha: "tree" });
    if (url.endsWith("/git/commits")) return Response.json({ sha: "commit" });
    if (url.endsWith("/git/refs/heads/roadmap-data")) return Response.json({});
    throw new Error(`Unexpected API path ${url}`);
  };
  await assert.rejects(publishFeed("{}", "test", fetcher), /Invalid roadmap/);
  assert.equal(calls.length, 0);
  const text = JSON.stringify(fixture(Math.floor(Date.now() / 1000) * 1000));
  assert.equal(await publishFeed(text, "test", fetcher), "commit");
  assert.deepEqual(calls.find(c => c.url.endsWith("/git/commits")).body.parents, ["old"]);
  assert.deepEqual(calls.find(c => c.options.method === "PATCH").body, { sha: "commit", force: false });
  assert.equal(calls.find(c => c.url.endsWith("/git/trees")).body.tree.length, 1);
  calls = [];
  await assert.rejects(publishFeed(text, "test", async () => new Response("", { status: 403 })), /403/);
});

test("first publication creates an orphan data branch, never a site/main commit", async () => {
  const calls = [];
  let reads = 0;
  const fetcher = async (url, options) => {
    const body = options.body && JSON.parse(options.body);
    calls.push({ url, body });
    if (url.endsWith("/git/ref/heads/roadmap-data")) {
      return ++reads === 1 ? new Response("", { status: 404 }) : Response.json({ object: { sha: "new" } });
    }
    return Response.json({ sha: "new" });
  };
  const text = JSON.stringify(fixture(Math.floor(Date.now() / 1000) * 1000));
  assert.equal(await publishFeed(text, "test", fetcher), "new");
  assert.deepEqual(calls.find(c => c.url.endsWith("/git/commits")).body.parents, []);
  assert.deepEqual(calls.find(c => c.url.endsWith("/git/refs")).body, { ref: "refs/heads/roadmap-data", sha: "new" });
  assert(calls.every(c => !c.url.includes("/heads/main")));
});
