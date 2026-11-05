import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateFeed, feedAge, MAX_FEED_BYTES } from "../shared/roadmap.mjs";

const REPO = "brandomoore/plozz-website";
const BRANCH = "roadmap-data";
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export async function publishFeed(text, token, fetcher = fetch, {
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  warn = message => console.warn(message),
} = {}) {
  if (!token) throw new Error("Missing GitHub feed publication token.");
  if (Buffer.byteLength(text) > MAX_FEED_BYTES) throw new Error("Roadmap feed too large.");
  const feed = validateFeed(JSON.parse(text));
  if (feedAge(feed).stale) throw new Error("Refusing to publish an old roadmap verification.");
  const deadline = Date.now() + 120_000;
  async function api(path, body, allowMissing = false) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Roadmap publication exceeded its retry budget; feed was not confirmed.");
      let result;
      let transportError;
      try {
        result = await fetcher(`https://api.github.com/repos/${REPO}${path}`, {
          method: body ? (path.startsWith("/git/refs/") ? "PATCH" : "POST") : "GET",
          headers: {
            Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
          redirect: "error", signal: AbortSignal.timeout(Math.min(30_000, remaining)),
        });
      } catch (error) {
        if (!(error instanceof TypeError) && error?.name !== "TimeoutError") throw error;
        transportError = error;
      }
      if (allowMissing && result?.status === 404) return null;
      if (result?.ok) return result.json();
      const failure = new Error(
        `Roadmap publication failed (${result?.status ?? "network/timeout"}); feed was not confirmed.`,
        transportError ? { cause: transportError } : undefined,
      );
      if (attempt === 3 || (result && !RETRYABLE_STATUS.has(result.status))) throw failure;
      const retryAfter = result?.headers.get("retry-after");
      const requestedDelay = retryAfter === null || retryAfter === undefined ? 0 :
        /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
      const delay = Math.max(1000 * 2 ** attempt, Number.isFinite(requestedDelay) ? requestedDelay : 0);
      if (delay > 30_000 || delay >= deadline - Date.now()) throw failure;
      await result?.body?.cancel();
      warn(`Roadmap publication retry ${attempt + 1}/3 (${result?.status ?? "network/timeout"}) in ${delay}ms.`);
      await sleep(delay);
    }
  }
  const ref = await api(`/git/ref/heads/${BRANCH}`, undefined, true);
  const blob = await api("/git/blobs", { content: text, encoding: "utf-8" });
  const tree = await api("/git/trees", {
    tree: [{ path: "roadmap.json", mode: "100644", type: "blob", sha: blob.sha }],
  });
  const commit = await api("/git/commits", {
    message: `Refresh verified roadmap (${feed.generated_at})`,
    tree: tree.sha, parents: ref ? [ref.object.sha] : [],
  });
  try {
    if (ref) {
      await api(`/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });
    } else {
      await api("/git/refs", { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
    }
  } catch (error) {
    // A lost creation acknowledgement can make the retry return "already exists".
    const observed = await api(`/git/ref/heads/${BRANCH}`, undefined, true);
    if (observed?.object?.sha !== commit.sha) throw error;
    warn("Roadmap publication acknowledgement failed; the exact published commit was verified by readback.");
  }
  const confirmed = await api(`/git/ref/heads/${BRANCH}`);
  if (confirmed.object.sha !== commit.sha) throw new Error("Roadmap publication readback did not match.");
  return commit.sha;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = await readFile(process.argv[2], "utf8");
  console.log(`Published verified roadmap: ${await publishFeed(text, process.env.GITHUB_TOKEN)}`);
}
