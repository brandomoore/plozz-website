import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { test } from "node:test";
import worker from "../worker/index.js";
import { PublicMetaDBPairing } from "../functions/_lib/publicmetadb-pairing.js";
import { sealKey } from "../public/publicmetadb-pair.js";

const key = `pm-${"a".repeat(60)}`;
const secret = Buffer.alloc(32, 7).toString("base64url");
const device = createECDH("prime256v1");
device.setPrivateKey(Buffer.alloc(32, 1));
const publicKey = device.getPublicKey().toString("base64url");
const prefix = "/api/publicmetadb/pairing";

function environment() {
  const objects = new Map();
  return {
    objects,
    PUBLICMETADB_PAIRING: {
      idFromName(name) { return name; },
      get(id) {
        if (!objects.has(id)) {
          const values = new Map();
          let queue = Promise.resolve();
          const state = {
            storage: {
              async get(key) { return structuredClone(values.get(key)); },
              async put(key, value) { values.set(key, structuredClone(value)); },
              async delete(key) { values.delete(key); },
              async deleteAll() { values.clear(); },
              async setAlarm(time) { state.alarm = time; },
            },
            blockConcurrencyWhile(action) {
              const result = queue.then(action);
              queue = result.catch(() => {});
              return result;
            },
          };
          objects.set(id, { object: new PublicMetaDBPairing(state), state, values });
        }
        return objects.get(id).object;
      },
    },
  };
}

function send(env, path, method = "GET", body, headers = {}) {
  return worker.fetch(new Request(`https://plozz.app${path}`, {
    method, headers: {
      "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1",
      Authorization: `Bearer ${secret}`, ...headers,
    }, body: body === undefined ? undefined : JSON.stringify(body),
  }), env, {});
}

async function start(env) {
  const response = await send(env, prefix, "POST", { publicKey });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const value = await response.json();
  assert.match(value.code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert(value.expiresAt > Date.now() && value.expiresAt <= Date.now() + 600000);
  return value;
}

test("encrypted browser handoff is bound to the app secret and consumed atomically", async () => {
  const env = environment();
  const { code } = await start(env);
  const lookup = await send(env, `${prefix}/${code}`);
  assert.deepEqual(Object.keys(await lookup.clone().json()).sort(), ["expiresAt", "publicKey"]);
  const envelope = await sealKey(key, (await lookup.json()).publicKey, code);
  assert(!JSON.stringify(envelope).includes(key));
  assert.equal((await send(env, `${prefix}/${code}`, "PUT", envelope)).status, 200);
  assert.equal((await send(env, `${prefix}/${code}/redeem`, "POST", undefined, {
    Authorization: `Bearer ${Buffer.alloc(32, 8).toString("base64url")}`,
  })).status, 401);
  const results = await Promise.all([
    send(env, `${prefix}/${code}/redeem`, "POST"),
    send(env, `${prefix}/${code}/redeem`, "POST"),
  ]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 410]);
  assert.deepEqual(await results.find(r => r.status === 200).json(), envelope);
  const stored = env.objects.get(`session:${code}`).values.get("session");
  assert.equal(stored.status, "consumed");
  assert.equal(stored.envelope, undefined);
  assert.equal(stored.publicKey, undefined);
  assert(!JSON.stringify(stored).includes(secret));
  assert(!JSON.stringify(stored).includes(key));
});

test("browser cryptography independently decrypts with only the requesting device key", async () => {
  const code = "ABCDEFGH";
  const envelope = await sealKey(key, publicKey, code);
  const context = "plozz-publicmetadb-pairing-v1";
  const { hkdfSync, createDecipheriv } = await import("node:crypto");
  const shared = device.computeSecret(Buffer.from(envelope.publicKey, "base64url"));
  const aes = hkdfSync("sha256", shared, Buffer.from(code), Buffer.from(context), 32);
  const sealed = Buffer.from(envelope.sealed, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", aes, sealed.subarray(0, 12));
  decipher.setAAD(Buffer.from(`${context}:${code}`));
  decipher.setAuthTag(sealed.subarray(-16));
  assert.equal(Buffer.concat([decipher.update(sealed.subarray(12, -16)), decipher.final()]).toString(), key);
  await assert.rejects(sealKey("not-a-key", publicKey, code));
  await assert.rejects(sealKey(key, `${publicKey}=`, code));
  await assert.rejects(sealKey(key, publicKey, "bad-code"));
});

test("pending polls do not consume sessions, and cancellation erases a queued key", async () => {
  const env = environment();
  const { code } = await start(env);
  assert.equal((await send(env, `${prefix}/${code}/redeem`, "POST")).status, 202);
  const envelope = await sealKey(key, publicKey, code);
  assert.equal((await send(env, `${prefix}/${code}`, "PUT", envelope)).status, 200);
  assert.equal((await send(env, `${prefix}/${code}`, "DELETE")).status, 204);
  assert.equal((await send(env, `${prefix}/${code}/redeem`, "POST")).status, 410);
  assert.equal((await send(env, `${prefix}/${code}`, "PUT", envelope)).status, 410);
  assert.equal(env.objects.get(`session:${code}`).values.get("session").envelope, undefined);
});

test("expiry is checked before every operation and alarms remove all temporary state", async () => {
  for (const method of ["GET", "PUT", "POST", "DELETE"]) {
    const env = environment();
    const { code } = await start(env);
    const owner = env.objects.get(`session:${code}`);
    owner.values.get("session").expiresAt = Date.now() - 1;
    const path = `${prefix}/${code}${method === "POST" ? "/redeem" : ""}`;
    assert.equal((await send(env, path, method, method === "PUT" ? {} : undefined)).status, 410);
    await owner.object.alarm();
    assert.equal(owner.values.size, 0);
  }
});

test("second submissions cannot replace the first encrypted handoff", async () => {
  const env = environment();
  const { code } = await start(env);
  const first = await sealKey(key, publicKey, code);
  const second = await sealKey(`pm-${"b".repeat(60)}`, publicKey, code);
  const responses = await Promise.all([
    send(env, `${prefix}/${code}`, "PUT", first), send(env, `${prefix}/${code}`, "PUT", second),
  ]);
  assert.deepEqual(responses.map(r => r.status), [200, 410]);
  assert.deepEqual(await (await send(env, `${prefix}/${code}/redeem`, "POST")).json(), first);
});

test("storage survives object eviction and a stale alarm cannot delete a current session", async () => {
  const env = environment();
  const { code } = await start(env);
  const owner = env.objects.get(`session:${code}`);
  await owner.object.alarm();
  assert.equal(owner.values.get("session").status, "pending");
  const envelope = await sealKey(key, publicKey, code);
  assert.equal((await send(env, `${prefix}/${code}`, "PUT", envelope)).status, 200);
  owner.object = new PublicMetaDBPairing(owner.state);
  assert.deepEqual(await (await send(env, `${prefix}/${code}/redeem`, "POST")).json(), envelope);
  owner.object = new PublicMetaDBPairing(owner.state);
  assert.equal((await send(env, `${prefix}/${code}/redeem`, "POST")).status, 410);
});

test("malformed keys, tokens, oversized bodies and plaintext submissions fail closed", async () => {
  const env = environment();
  for (const value of [null, {}, { publicKey: "invalid" }, { publicKey: "x".repeat(5000) }]) {
    assert.equal((await send(env, prefix, "POST", value)).status, 400);
  }
  assert.equal((await send(env, prefix, "POST", { publicKey }, { Authorization: "Bearer short" })).status, 400);
  assert.equal((await send(env, prefix, "POST", { publicKey }, { Authorization: secret })).status, 400);
  const { code } = await start(env);
  for (const value of [
    { key }, { version: 2, publicKey, sealed: "x" },
    { version: 1, publicKey, sealed: Buffer.alloc(90).toString("base64url") },
    { version: 1, publicKey: Buffer.alloc(65).toString("base64url"), sealed: Buffer.alloc(91).toString("base64url") },
  ]) {
    assert.equal((await send(env, `${prefix}/${code}`, "PUT", value)).status, 400);
  }
  assert.equal((await send(env, `${prefix}/${code}/redeem`, "POST")).status, 202);
});

test("cross-origin requests and query credentials are refused without CORS access", async () => {
  const env = environment();
  for (const origin of ["https://attacker.invalid", "null"]) {
    const response = await send(env, prefix, "POST", { publicKey }, { Origin: origin });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  }
  assert.equal((await send(env, `${prefix}?secret=anything`, "POST", { publicKey })).status, 400);
  assert.equal(env.objects.size, 0);
});

test("rate limits bound session creation and missing bindings or client identity stay unavailable", async () => {
  const env = environment();
  for (let index = 0; index < 20; index++) await start(env);
  assert.equal((await send(env, prefix, "POST", { publicKey })).status, 429);
  assert.equal((await send({}, prefix, "POST", { publicKey })).status, 503);
  assert.equal((await send(environment(), prefix, "POST", { publicKey }, { "CF-Connecting-IP": "" })).status, 503);
});

test("an expired-object response cannot outlive an unread inbound key-handoff stream", async () => {
  const request = new Request(`https://plozz.app${prefix}/ABCDEFGH`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1" },
    body: JSON.stringify(await sealKey(key, publicKey, "ABCDEFGH")),
  });
  const response = await worker.fetch(request, environment(), {});
  assert.equal(response.status, 410);
  assert.equal(request.bodyUsed, true);
});

test("pairing page has no external scripts, credentials, framing or referrer leakage", async () => {
  const response = await send({}, "/publicmetadb");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const html = await response.text();
  assert.match(html, /type="password"/);
  assert.match(html, /autocomplete="off"/);
  assert(!html.includes(secret) && !html.includes(key));
  assert.equal((await send({}, "/publicmetadb", "POST", {})).status, 405);
});
