import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateFeed, feedAge, MAX_FEED_BYTES } from "../shared/roadmap.mjs";

const REPO = "brandomoore/plozz-website";
const BRANCH = "roadmap-data";

export async function publishFeed(text, token, fetcher = fetch) {
  if (!token) throw new Error("Missing GitHub feed publication token.");
  if (Buffer.byteLength(text) > MAX_FEED_BYTES) throw new Error("Roadmap feed too large.");
  const feed = validateFeed(JSON.parse(text));
  if (feedAge(feed).stale) throw new Error("Refusing to publish an old roadmap verification.");
  async function api(path, body, allowMissing = false) {
    const result = await fetcher(`https://api.github.com/repos/${REPO}${path}`, {
      method: body ? (path.startsWith("/git/refs/") ? "PATCH" : "POST") : "GET",
      headers: {
        Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (allowMissing && result.status === 404) return null;
    if (!result.ok) throw new Error(`Roadmap publication failed (${result.status}); feed was not confirmed.`);
    return result.json();
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
  if (ref) {
    await api(`/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });
  } else {
    await api("/git/refs", { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
  }
  const confirmed = await api(`/git/ref/heads/${BRANCH}`);
  if (confirmed.object.sha !== commit.sha) throw new Error("Roadmap publication readback did not match.");
  return commit.sha;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = await readFile(process.argv[2], "utf8");
  console.log(`Published verified roadmap: ${await publishFeed(text, process.env.GITHUB_TOKEN)}`);
}
