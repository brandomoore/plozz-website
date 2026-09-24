import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import worker from "../worker/index.js";

function environment() {
  const values = new Map();
  const calls = [];
  return {
    values,
    calls,
    env: {
      ANILIST_CLIENT_ID: "test-anilist-client",
      MAL_CLIENT_ID: "test-mal-client",
      AUTH_KV: {
        async get(key, type) {
          calls.push(["get", key]);
          const value = values.get(key) ?? null;
          return type === "json" && value !== null ? JSON.parse(value) : value;
        },
        async put(key, value, options) {
          calls.push(["put", key, options]);
          values.set(key, value);
        },
        async delete(key) {
          calls.push(["delete", key]);
          values.delete(key);
        },
      },
      ASSETS: {
        async fetch(url) {
          calls.push(["asset", String(url)]);
          return new Response("<h1>Not found</h1>", {
            headers: { "Content-Type": "text/html", "Cache-Control": "max-age=86400" },
          });
        },
      },
    },
  };
}

function request(path, method = "GET", body) {
  return new Request(`https://plozz.app${path}`, {
    method,
    body,
    headers: { "Content-Type": "application/json", "cf-connecting-ip": "192.0.2.1" },
  });
}

for (const path of ["/anilist", "/myanimelist", "/auth/anilist/callback", "/auth/mal/callback", "/api/redeem"]) {
  test(`${path}: unsupported methods retain 405 without touching storage`, async () => {
    const { env, calls } = environment();
    const response = await worker.fetch(request(path, "POST"), env, {});
    assert.equal(response.status, 405);
    assert(response.headers.get("Allow").includes("GET"));
    assert.deepEqual(calls, []);
  });
}

test("AniList redirect preserves optional TV-session cookie and never contacts the provider", async () => {
  const { env, calls } = environment();
  const response = await worker.fetch(request("/anilist/?s=TestSession123"), env, {});
  const location = new URL(response.headers.get("Location"));
  assert.equal(response.status, 302);
  assert.equal(location.origin, "https://anilist.co");
  assert.equal(location.searchParams.get("client_id"), env.ANILIST_CLIENT_ID);
  assert.equal(location.searchParams.get("response_type"), "token");
  assert.match(response.headers.get("Set-Cookie"), /^tv_session=TestSession123;.*Secure; SameSite=Lax$/);
  assert.deepEqual(calls, []);
  const invalid = await worker.fetch(request("/anilist?s=invalid%20session"), env, {});
  assert.equal(invalid.headers.get("Set-Cookie"), null);
});

test("MAL initiation stores its PKCE session in mocked KV and keeps the public callback URL", async () => {
  const { env, calls, values } = environment();
  const response = await worker.fetch(request("/myanimelist?s=TestSession123"), env, {});
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location"));
  assert.equal(location.origin, "https://myanimelist.net");
  assert.equal(location.searchParams.get("redirect_uri"), "https://plozz.app/auth/mal/callback");
  assert.equal(location.searchParams.get("client_id"), env.MAL_CLIENT_ID);
  const session = JSON.parse(values.get(`session:${location.searchParams.get("state")}`));
  assert.equal(session.tvSession, "TestSession123");
  assert.equal(session.codeVerifier, location.searchParams.get("code_challenge"));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2], { expirationTtl: 600 });
});

test("callback pages retain read-only missing/expired-session behavior", async () => {
  const { env, calls } = environment();
  const anilist = await worker.fetch(request("/auth/anilist/callback/"), env, {});
  assert.equal(anilist.status, 200);
  assert.match(await anilist.text(), /window.location.hash/);
  const missing = await worker.fetch(request("/auth/mal/callback"), env, {});
  assert.equal(missing.status, 400);
  assert.match(await missing.text(), /Missing authorization code/);
  assert.deepEqual(calls, []);
  const expired = await worker.fetch(request("/auth/mal/callback?code=test-code&state=absent"), env, {});
  assert.equal(expired.status, 410);
  assert.deepEqual(calls, [["get", "session:absent"]]);
});

for (const [path, method, expected] of [
  ["/api/store", "POST", "POST"],
  ["/api/redeem", "GET", "GET"],
]) {
  test(`${path}: CORS preflight preserves allowed method`, async () => {
    const { env, calls } = environment();
    const response = await worker.fetch(request(`${path}/`, "OPTIONS"), env, {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(response.headers.get("Access-Control-Allow-Methods"), expected);
    assert.deepEqual(calls, []);
    const unsupported = await worker.fetch(request(path, "DELETE"), env, {});
    assert.equal(unsupported.status, 405);
    assert.equal(unsupported.headers.get("Allow"), `${method}, OPTIONS`);
  });
}

test("invalid API input has no KV side effects", async () => {
  const { env, calls } = environment();
  for (const [path, method, body, expected] of [
    ["/api/redeem", "GET", undefined, "missing_code"],
    ["/api/store", "POST", "{}", "missing_fields"],
    ["/api/store", "POST", "{", "invalid_body"],
  ]) {
    const response = await worker.fetch(request(path, method, body), env, {});
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: expected });
  }
  assert.deepEqual(calls, []);
});

test("store and one-time redeem preserve session binding using synthetic local data only", async () => {
  const { env, values } = environment();
  const stored = await worker.fetch(request("/api/store", "POST", JSON.stringify({
    service: "anilist",
    accessToken: "synthetic-test-token",
    tvSession: "TestSession123",
  })), env, {});
  const { code } = await stored.json();
  assert.match(code, /^\d{4}$/);
  assert(values.has(`redeem:${code}`));
  const wrongSession = await worker.fetch(request(`/api/redeem?code=${code}&session=wrong`), env, {});
  assert.equal(wrongSession.status, 404);
  assert(values.has(`redeem:${code}`));
  const redeemed = await worker.fetch(request(`/api/redeem?code=${code}&session=TestSession123`), env, {});
  assert.equal(redeemed.status, 200);
  assert.equal((await redeemed.json()).accessToken, "synthetic-test-token");
  assert.equal(values.has(`redeem:${code}`), false);
  assert.equal(values.has("fail:192.0.2.1"), false);
});

test("redeem throttling retains its existing limit", async () => {
  const { env, calls, values } = environment();
  values.set("fail:192.0.2.1", "10");
  const response = await worker.fetch(request("/api/redeem?code=0000"), env, {});
  assert.equal(response.status, 429);
  assert.deepEqual(calls, [["get", "fail:192.0.2.1"]]);
});

test("unmatched requests use the asset 404 without inheriting success cache headers", async () => {
  const { env, calls } = environment();
  const response = await worker.fetch(request("/missing"), env, {});
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("Content-Type"), "text/html");
  assert.equal(response.headers.get("Cache-Control"), null);
  assert.equal(await response.text(), "<h1>Not found</h1>");
  assert.deepEqual(calls, [["asset", "https://plozz.app/404"]]);
});

test("production configuration preserves assets-first behavior and delegates route ownership", () => {
  const config = readFileSync(new URL("../wrangler.worker.toml", import.meta.url), "utf8");
  assert.match(config, /name = "plozz-website"/);
  assert.match(config, /compatibility_date = "2026-08-18"/);
  assert.match(config, /keep_vars = true/);
  assert.match(config, /binding = "AUTH_KV"/);
  assert.match(config, /binding = "ASSETS"/);
  assert.match(config, /run_worker_first = false/);
  assert.match(config, /html_handling = "auto-trailing-slash"/);
  assert.match(config, /not_found_handling = "none"/);
  assert.doesNotMatch(config, /^\s*(routes?|workers_dev|preview_urls|pages_build_output_dir)\s*=/m);
  assert.doesNotMatch(config, /^\s*\[vars\]/m);
});
