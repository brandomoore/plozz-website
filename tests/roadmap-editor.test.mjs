import assert from "node:assert/strict";
import { test } from "node:test";
import { handleRoadmapEditor } from "../worker/roadmap-editor.js";
import { AUTHORITY_REVISION } from "../shared/roadmap.mjs";
import { FEED_URL } from "../worker/roadmap.js";

const origin = "https://plozz.app";
const now = Date.parse("2026-11-05T00:00:00Z");
const token = "ghu_test_only_token";
const issue = {
  number: 219, state: "open",
  labels: [{ name: "enhancement" }, { name: "triage: backlog" }, { name: "custom" }],
};
const feed = {
  schema_version: 1, generated_at: new Date(now).toISOString().replace(".000Z", "Z"),
  source: {
    repository: "brandomoore/Plozz", revision: "a".repeat(40), authority_revision: AUTHORITY_REVISION,
    run_url: "https://github.com/brandomoore/plozz-website/actions/runs/123",
  },
  items: [{
    number: 219, title: "Offline mode", kind: "feature", stage: "backlog",
    github_url: "https://github.com/brandomoore/Plozz/issues/219", discord_urls: [],
  }],
};

function harness() {
  const values = new Map();
  const calls = [];
  const h = {
    values, calls, issue: structuredClone(issue), feed: structuredClone(feed),
    user: { id: 16313090, login: "brandomoore" }, time: now,
    failDelete: false, revoked: false,
    env: {
      GITHUB_ROADMAP_CLIENT_ID: "test-client",
      GITHUB_ROADMAP_CLIENT_SECRET: "test-only-client-secret",
      ROADMAP_SESSION_KEY: Buffer.alloc(32, 7).toString("base64url"),
      ROADMAP_AUTH: {
        async get(key) { return values.get(key) || null; },
        async put(key, value, options) { assert(options.expirationTtl > 0); values.set(key, value); },
        async delete(key) { values.delete(key); },
      },
    },
    async fetcher(url, options = {}) {
      calls.push({ url, options });
      assert.equal(options.redirect, "manual");
      if (url === "https://github.com/login/oauth/access_token") {
        if (h.codeUsed) return new Response("", { status: 400 });
        h.codeUsed = true;
        const body = JSON.parse(options.body);
        assert.equal(body.repository_id, 1275907950);
        assert.equal(body.redirect_uri, `${origin}/auth/roadmap/callback`);
        assert.equal(body.client_secret, h.env.GITHUB_ROADMAP_CLIENT_SECRET);
        const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.code_verifier))).toString("base64url");
        assert.equal(challenge, h.challenge);
        return Response.json({ access_token: token, expires_in: 28800, token_type: "bearer" });
      }
      if (url === FEED_URL) return Response.json(h.feed);
      if (url.includes("/applications/test-client/token")) {
        assert.equal(options.method, "DELETE");
        h.revoked = true;
        return new Response(null, { status: 204 });
      }
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      if (url === "https://api.github.com/user") return h.revoked ? new Response("", { status: 401 }) : Response.json(h.user);
      if (url.endsWith("/issues/219")) return Response.json(h.issue);
      if (url.endsWith("/issues/219/labels")) {
        assert.equal(options.method, "POST");
        for (const name of JSON.parse(options.body).labels) {
          if (!h.issue.labels.some(label => label.name === name)) h.issue.labels.push({ name });
        }
        return Response.json(h.issue.labels);
      }
      if (url.includes("/issues/219/labels/")) {
        assert.equal(options.method, "DELETE");
        const name = decodeURIComponent(url.split("/labels/")[1]);
        if (h.failDelete === true || h.failDelete === name) return new Response("", { status: 503 });
        h.issue.labels = h.issue.labels.filter(label => label.name !== name);
        return Response.json(h.issue.labels);
      }
      throw new Error(`Unexpected mock request: ${url}`);
    },
    request(path, options = {}) {
      return handleRoadmapEditor(new Request(origin + path, options), h.env, { waitUntil() {} }, {
        fetcher: h.fetcher, now: h.time,
      });
    },
    async start() {
      const response = await h.request("/auth/roadmap/login");
      assert.equal(response.status, 303);
      const target = new URL(response.headers.get("location"));
      assert.equal(target.origin, "https://github.com");
      assert.equal(target.searchParams.get("code_challenge_method"), "S256");
      assert.equal(target.searchParams.get("scope"), null);
      h.challenge = target.searchParams.get("code_challenge");
      h.state = target.searchParams.get("state");
      h.stateCookie = response.headers.get("set-cookie").split(";")[0];
      assert.equal(values.size, 0, "Anonymous login must not allocate server-side storage");
      return response;
    },
    async signIn() {
      await h.start();
      const response = await h.request(`/auth/roadmap/callback?state=${h.state}&code=test-code`, { headers: { Cookie: h.stateCookie } });
      const sessionCookie = response.headers.getSetCookie().find(value => value.startsWith("__Host-roadmap-session="));
      assert.ok(sessionCookie);
      assert.match(sessionCookie, /HttpOnly; Secure; SameSite=Lax/);
      h.cookie = sessionCookie.split(";")[0];
      const session = await h.request("/api/roadmap/editor/session", { headers: { Cookie: h.cookie } });
      h.csrf = (await session.json()).csrf;
    },
    move(stage, expectedStage = "backlog", overrides = {}) {
      return h.request("/api/roadmap/editor/issues/219", {
        method: "PATCH",
        headers: {
          Cookie: h.cookie, Origin: origin, "X-Roadmap-CSRF": h.csrf,
          "Content-Type": "application/json", ...overrides.headers,
        },
        body: JSON.stringify({ stage, expectedStage }),
        ...overrides.options,
      });
    },
  };
  return h;
}

test("editor is explicitly unavailable without setup and refuses unknown routes and methods", async () => {
  const ctx = { waitUntil() {} };
  const result = await handleRoadmapEditor(new Request(`${origin}/api/roadmap/editor/session`), {}, ctx);
  assert.deepEqual(await result.json(), { configured: false, authenticated: false });
  assert.equal((await handleRoadmapEditor(new Request(`${origin}/api/roadmap/editor/issues/219`, { method: "PATCH" }), {}, ctx)).status, 503);
  assert.equal((await handleRoadmapEditor(new Request(`${origin}/api/roadmap/editor/unknown`), {}, ctx)).status, 404);
  const wrong = await handleRoadmapEditor(new Request(`${origin}/api/roadmap/editor/logout`), {}, ctx);
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get("allow"), "POST");
});

test("GitHub sign-in binds state to the browser, uses PKCE, and stores encrypted server-side credentials", async () => {
  const h = harness();
  await h.signIn();
  assert([...h.values.keys()].every(key => !key.includes(h.cookie.split("=")[1])));
  assert([...h.values.values()].every(value => !value.includes(token) && !value.includes(h.csrf)));
  const session = await h.request("/api/roadmap/editor/session", { headers: { Cookie: h.cookie } });
  assert.equal(session.headers.get("cache-control"), "no-store");
  assert.equal(session.headers.get("referrer-policy"), "no-referrer");
  const text = await session.text();
  assert(!text.includes(token) && !text.includes(h.env.GITHUB_ROADMAP_CLIENT_SECRET));
  assert.equal(JSON.parse(text).user.login, "brandomoore");
  const replay = await h.request(`/auth/roadmap/callback?state=${h.state}&code=test-code`, { headers: { Cookie: h.stateCookie } });
  assert.equal(replay.headers.get("location"), `${origin}/roadmap/?editor=failed`);
});

test("wrong, missing, expired and duplicate OAuth state never exchange a code", async () => {
  for (const variation of ["missing-cookie", "wrong-state", "duplicate-state", "expired"]) {
    const h = harness();
    await h.start();
    if (variation === "expired") h.time += 601_000;
    const query = variation === "wrong-state" ? "state=wrong" :
      `state=${h.state}${variation === "duplicate-state" ? `&state=${h.state}` : ""}`;
    const result = await h.request(`/auth/roadmap/callback?${query}&code=test-code`, {
      headers: variation === "missing-cookie" ? {} : { Cookie: h.stateCookie },
    });
    assert.equal(result.headers.get("location"), `${origin}/roadmap/?editor=failed`);
    assert.equal(h.calls.length, 0);
  }
});

test("authorization requires the immutable maintainer ID and expected login, rechecked on every write", async () => {
  const h = harness();
  await h.signIn();
  h.user.id = 999;
  assert.equal((await h.move("planned")).status, 403);
  assert(!h.issue.labels.some(label => label.name.startsWith("roadmap:")));
  const other = harness();
  other.user.login = "another-user";
  await other.start();
  const denied = await other.request(`/auth/roadmap/callback?state=${other.state}&code=test-code`, { headers: { Cookie: other.stateCookie } });
  assert.equal(denied.headers.get("location"), `${origin}/roadmap/?editor=denied`);
  assert(![...other.values.keys()].some(key => key.startsWith("session:")));
});

test("writes require same-origin requests, valid CSRF, a live session, and a bounded exact JSON contract", async () => {
  const h = harness();
  await h.signIn();
  for (const headers of [{ Origin: "https://evil.example" }, { "X-Roadmap-CSRF": "wrong" }, { Cookie: "" }]) {
    const count = h.calls.length;
    assert([401, 403].includes((await h.move("planned", "backlog", { headers })).status));
    assert.equal(h.calls.length, count);
  }
  assert.equal((await h.move("released")).status, 400);
  assert.equal((await h.move("in-beta")).status, 400);
  assert.equal((await h.move("planned", "backlog", { options: { body: JSON.stringify({ stage: "planned", expectedStage: "backlog", repository: "another/repo" }) } })).status, 400);
  assert.equal((await h.move("planned", "backlog", { options: { body: "x".repeat(1025) } })).status, 413);
  h.time += 28801_000;
  assert.equal((await h.move("planned")).status, 401);
});

test("stage moves change only commitment labels, preserve other labels, and verify readback", async () => {
  const h = harness();
  await h.signIn();
  for (const [stage, previous] of [["planned", "backlog"], ["in-progress", "planned"], ["backlog", "in-progress"]]) {
    const result = await h.move(stage, previous);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { number: 219, stage, saved_at: new Date(now).toISOString() });
    assert(h.issue.labels.some(label => label.name === "custom"));
    assert(h.issue.labels.some(label => label.name === "triage: backlog"));
    assert.equal(h.issue.labels.filter(label => label.name.startsWith("roadmap:")).length, stage === "backlog" ? 0 : 1);
  }
  assert(h.calls.every(call => call.options.method !== "PUT"));
});

test("closed items, pull requests, conflicts and verified delivery stages cannot be manually moved", async () => {
  for (const change of [
    h => { h.issue.state = "closed"; },
    h => { h.issue.pull_request = {}; },
    h => { h.issue.labels.push({ name: "roadmap: planned" }); },
    h => { h.issue.labels.push({ name: "roadmap: planned" }, { name: "roadmap: in progress" }); },
    h => { h.feed.items[0].stage = "in-beta"; },
    h => { h.feed.items[0].stage = "released"; },
    h => { h.feed.items = []; },
  ]) {
    const h = harness();
    await h.signIn();
    change(h);
    const result = await h.move("planned");
    assert.equal(result.status, 409);
    assert(!h.calls.some(call => call.url.includes("/issues/219/labels")));
  }
});

test("partial GitHub failures stay explicit and never report a successful move", async () => {
  const h = harness();
  await h.signIn();
  h.issue.labels.push({ name: "roadmap: planned" });
  h.failDelete = true;
  const result = await h.move("in-progress", "planned");
  assert.equal(result.status, 502);
  const text = await result.text();
  assert.match(text, /Check the issue/);
  assert(!text.includes(token));
  assert(h.issue.labels.some(label => label.name === "custom"));
});

test("a failed removal rolls back the added label when the original stage is still present", async () => {
  const h = harness();
  await h.signIn();
  h.issue.labels.push({ name: "roadmap: planned" });
  h.failDelete = "roadmap: planned";
  assert.equal((await h.move("in-progress", "planned")).status, 502);
  assert(h.issue.labels.some(label => label.name === "roadmap: planned"));
  assert(!h.issue.labels.some(label => label.name === "roadmap: in progress"));
});

test("already revoked sessions can still sign out and clear their cookie", async () => {
  const h = harness();
  await h.signIn();
  h.revoked = true;
  const response = await h.request("/api/roadmap/editor/logout", {
    method: "POST", headers: { Cookie: h.cookie, Origin: origin, "X-Roadmap-CSRF": h.csrf },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
});

test("logout revokes the GitHub token, deletes the server session, and clears the host-only cookie", async () => {
  const h = harness();
  await h.signIn();
  const result = await h.request("/api/roadmap/editor/logout", {
    method: "POST", headers: { Cookie: h.cookie, Origin: origin, "X-Roadmap-CSRF": h.csrf },
  });
  assert.equal(result.status, 200);
  assert(h.revoked);
  assert.match(result.headers.get("set-cookie"), /Max-Age=0; HttpOnly; Secure/);
  assert(![...h.values.keys()].some(key => key.startsWith("session:")));
  assert.equal((await h.move("planned")).status, 401);
});
