const TTL_MS = 10 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE = /^[A-HJ-NP-Z2-9]{8}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PREFIX = "/api/publicmetadb/pairing";
const HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function reply(value, status = 200) {
  return Response.json(value, { status, headers: HEADERS });
}

class InvalidRequest extends Error {}

async function json(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new InvalidRequest();
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidRequest();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) {
      await reader.cancel();
      throw new InvalidRequest();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new InvalidRequest(); }
}

function bytes(value, length) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new InvalidRequest();
  let decoded;
  try { decoded = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)); }
  catch { throw new InvalidRequest(); }
  if (decoded.length !== length || base64url(decoded) !== value) throw new InvalidRequest();
  return decoded;
}

function base64url(value) {
  return btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function publicKey(value) {
  const raw = bytes(value, 65);
  try { await crypto.subtle.importKey("raw", raw, { name: "ECDH", namedCurve: "P-256" }, false, []); }
  catch { throw new InvalidRequest(); }
  return value;
}

async function digest(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function bearer(request) {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!TOKEN.test(token ?? "")) throw new InvalidRequest();
  bytes(token, 32);
  return token;
}

function randomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), value => ALPHABET[value % 32]).join("");
}

export async function handlePairing(request, env) {
  try {
    if (!env.PUBLICMETADB_PAIRING) return reply({ error: "pairing_unavailable" }, 503);
    const url = new URL(request.url);
    if (url.search) return reply({ error: "invalid_request" }, 400);
    const suffix = url.pathname.slice(PREFIX.length);
    const match = suffix.match(/^\/([A-HJ-NP-Z2-9]{8})(\/redeem)?$/);
    const allowed = !suffix ? ["POST"] : match?.[2] ? ["POST"] : match ? ["GET", "PUT", "DELETE"] : [];
    if (!allowed.length) return reply({ error: "not_found" }, 404);
    if (!allowed.includes(request.method)) {
      return new Response(null, { status: 405, headers: { ...HEADERS, Allow: allowed.join(", ") } });
    }
    // Browser submissions are same-origin only. Native requests do not carry Origin.
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return reply({ error: "invalid_origin" }, 403);
    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip) return reply({ error: "pairing_unavailable" }, 503);
    const rate = env.PUBLICMETADB_PAIRING.get(
      env.PUBLICMETADB_PAIRING.idFromName(`rate:${await digest(ip)}`)
    );
    const limit = await rate.fetch(new Request("https://pairing.internal/limit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ create: !suffix }),
    }));
    if (limit.status !== 204) return limit;
    if (!suffix) {
      const body = await json(request);
      const key = await publicKey(body?.publicKey);
      const secret = bearer(request);
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = randomCode();
        const session = env.PUBLICMETADB_PAIRING.get(env.PUBLICMETADB_PAIRING.idFromName(`session:${code}`));
        const result = await session.fetch(new Request("https://pairing.internal/create", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicKey: key, secretHash: await digest(secret), code }),
        }));
        if (result.status !== 409) return result;
      }
      return reply({ error: "pairing_unavailable" }, 503);
    }
    const session = env.PUBLICMETADB_PAIRING.get(env.PUBLICMETADB_PAIRING.idFromName(`session:${match[1]}`));
    // Finish reading the inbound stream before a fast expired-session response
    // can close its lifetime while the object transport is still forwarding it.
    const forwarded = request.method === "PUT"
      ? new Request(request, { body: JSON.stringify(await json(request)) })
      : request;
    return await session.fetch(forwarded);
  } catch (error) {
    if (error instanceof InvalidRequest) return reply({ error: "invalid_request" }, 400);
    console.error("PublicMetaDB pairing request failed");
    return reply({ error: "pairing_unavailable" }, 503);
  }
}

export class PublicMetaDBPairing {
  constructor(state) { this.state = state; }

  fetch(request) {
    // KV get/delete is eventually consistent. A single object serializes redemption
    // with submission, cancellation and expiry, including concurrent requests.
    return this.state.blockConcurrencyWhile(async () => {
      try { return await this.handle(request); }
      catch (error) {
        if (error instanceof InvalidRequest) return reply({ error: "invalid_request" }, 400);
        console.error("PublicMetaDB pairing storage failed");
        return reply({ error: "pairing_unavailable" }, 503);
      }
    });
  }

  async handle(request) {
    const storage = this.state.storage;
    const now = Date.now();
    const path = new URL(request.url).pathname;
    if (path === "/limit") {
      const input = await json(request);
      let value = await storage.get("rate");
      if (!value || now >= value.expiresAt) value = { requests: 0, creates: 0, expiresAt: now + TTL_MS };
      value.requests++;
      if (input.create) value.creates++;
      await storage.put("rate", value);
      await storage.setAlarm(value.expiresAt);
      return value.requests > 1200 || value.creates > 20
        ? reply({ error: "too_many_attempts" }, 429)
        : new Response(null, { status: 204, headers: HEADERS });
    }
    let value = await storage.get("session");
    if (value && now >= value.expiresAt) {
      await storage.delete("session");
      value = null;
    }
    if (path === "/create") {
      if (value) return reply({ error: "code_in_use" }, 409);
      const input = await json(request);
      if (!CODE.test(input?.code) || !TOKEN.test(input?.secretHash)) throw new InvalidRequest();
      value = { ...input, status: "pending", expiresAt: now + TTL_MS };
      await storage.put("session", value);
      await storage.setAlarm(value.expiresAt);
      return reply({ code: value.code, expiresAt: value.expiresAt }, 201);
    }
    if (!value) return reply({ error: "expired" }, 410);
    if (request.method === "GET") {
      if (value.status !== "pending") return reply({ error: "already_used" }, 410);
      return reply({ publicKey: value.publicKey, expiresAt: value.expiresAt });
    }
    if (request.method === "PUT") {
      if (value.status !== "pending") return reply({ error: "already_used" }, 410);
      const input = await json(request);
      if (input?.version !== 1) throw new InvalidRequest();
      const key = await publicKey(input.publicKey);
      // Exactly 63 UTF-8 key bytes, plus a 12-byte nonce and 16-byte GCM tag.
      bytes(input.sealed, 91);
      value.envelope = { version: 1, publicKey: key, sealed: input.sealed };
      value.status = "ready";
      await storage.put("session", value);
      return reply({ status: "sent" });
    }
    if (await digest(bearer(request)) !== value.secretHash) return reply({ error: "unauthorized" }, 401);
    if (request.method === "DELETE") {
      value.status = "cancelled";
      delete value.envelope;
      delete value.publicKey;
      await storage.put("session", value);
      return new Response(null, { status: 204, headers: HEADERS });
    }
    if (request.method === "POST" && path.endsWith("/redeem")) {
      if (value.status === "pending") return reply({ status: "pending" }, 202);
      if (value.status !== "ready") return reply({ error: "already_used" }, 410);
      const envelope = value.envelope;
      value.status = "consumed";
      delete value.envelope;
      delete value.publicKey;
      await storage.put("session", value);
      return reply(envelope);
    }
    return reply({ error: "not_found" }, 404);
  }

  alarm() {
    return this.state.blockConcurrencyWhile(async () => {
      const storage = this.state.storage;
      const value = await storage.get("session") ?? await storage.get("rate");
      if (value?.expiresAt > Date.now()) {
        await storage.setAlarm(value.expiresAt);
      } else {
        await storage.deleteAll();
      }
    });
  }
}
