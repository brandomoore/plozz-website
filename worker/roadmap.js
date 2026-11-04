import { validateFeed, feedAge, MAX_FEED_BYTES } from "../shared/roadmap.mjs";

export const FEED_URL = "https://raw.githubusercontent.com/brandomoore/plozz-website/roadmap-data/roadmap.json";
const CACHE_URL = "https://plozz.app/api/roadmap/verified-snapshot-v1";

function response(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": status === 200 && body.status === "current" ? "public, max-age=60" : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readFeed(response, now) {
  if (!response.ok || Number(response.headers.get("content-length")) > MAX_FEED_BYTES) {
    throw new Error("Roadmap upstream unavailable or oversized.");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_FEED_BYTES) throw new Error("Roadmap upstream oversized.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return validateFeed(JSON.parse(new TextDecoder().decode(bytes)), now);
}

export async function handleRoadmap(request, ctx, {
  fetcher = fetch, cache = globalThis.caches?.default, now = Date.now(),
} = {}) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  }
  let saved;
  try {
    const cached = await cache?.match(CACHE_URL);
    if (cached) {
      saved = await cached.json();
      validateFeed(saved.feed, now);
      if (!Number.isFinite(saved.fetched_at) || saved.fetched_at > now) {
        throw new Error("Roadmap cache metadata is invalid.");
      }
      if (feedAge(saved.feed, now).expired) saved = undefined;
    }
  } catch {
    console.error("Roadmap cache could not be read.");
    saved = undefined;
  }
  if (saved && now - saved.fetched_at < 5 * 60 * 1000) {
    return response({ feed: saved.feed, status: feedAge(saved.feed, now).stale ? "delayed" : "current" });
  }
  try {
    const upstream = await fetcher(FEED_URL, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      cf: { cacheTtl: 0 },
    });
    const feed = await readFeed(upstream, now);
    if (feedAge(feed, now).expired) throw new Error("Roadmap snapshot expired.");
    if (saved && Date.parse(feed.generated_at) < Date.parse(saved.feed.generated_at)) {
      throw new Error("Roadmap snapshot moved backwards.");
    }
    if (cache) {
      ctx.waitUntil(cache.put(CACHE_URL, Response.json({ feed, fetched_at: now }, {
        headers: { "Cache-Control": "public, max-age=604800" },
      })).catch(() => console.error("Roadmap cache could not be written.")));
    }
    return response({ feed, status: feedAge(feed, now).stale ? "delayed" : "current" });
  } catch {
    // Keep the original verification time. A successful cache read is not new evidence.
    console.error("Roadmap refresh failed; retaining only a previously validated snapshot.");
    if (saved) return response({ feed: saved.feed, status: "delayed" });
    return response({ error: "roadmap_unavailable" }, 503);
  }
}
