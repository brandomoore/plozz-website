export const AUTHORITY_REVISION = "54858354cb10314f843c1236d3cbab7a9f8f0f13";
export const REPOSITORY = "brandomoore/Plozz";
export const MAX_FEED_BYTES = 2_000_000;
export const STALE_AFTER_MS = 60 * 60 * 1000;
export const EXPIRES_AFTER_MS = 7 * 24 * STALE_AFTER_MS;
export const PAGE_SIZE = 4;

export const STAGES = [
  { id: "backlog", label: "Backlog", description: "", empty: "No items in the backlog." },
  { id: "planned", label: "Planned", description: "Chosen by Brandon.", empty: "Nothing committed here yet." },
  { id: "in-progress", label: "In progress", description: "Work has started.", empty: "No work marked in progress." },
  { id: "in-beta", label: "In beta", description: "Available in TestFlight.", empty: "No items waiting in beta." },
  { id: "released", label: "Released", description: "Available in the App Store.", empty: "No verified releases here yet." },
];

function requireValue(condition) {
  if (!condition) throw new Error("Invalid roadmap feed.");
}

function exactKeys(value, keys) {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value));
  requireValue(Object.keys(value).sort().join(",") === keys.slice().sort().join(","));
}

function timestamp(value) {
  requireValue(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value));
  requireValue(Number.isFinite(Date.parse(value)));
  requireValue(new Date(value).toISOString().replace(".000Z", "Z") === value);
}

/** Both the public endpoint and the browser fail closed on a malformed snapshot. */
export function validateFeed(feed, now = Date.now()) {
  exactKeys(feed, ["schema_version", "generated_at", "source", "items"]);
  requireValue(feed.schema_version === 1);
  timestamp(feed.generated_at);
  requireValue(Date.parse(feed.generated_at) <= now + 5 * 60 * 1000);
  exactKeys(feed.source, ["repository", "revision", "authority_revision", "run_url"]);
  requireValue(feed.source.repository === REPOSITORY);
  requireValue(/^[a-f0-9]{40}$/.test(feed.source.revision));
  requireValue(feed.source.authority_revision === AUTHORITY_REVISION);
  requireValue(/^https:\/\/github\.com\/brandomoore\/(?:plozz-website|Plozz)\/actions\/runs\/[1-9]\d*$/.test(feed.source.run_url));
  requireValue(Array.isArray(feed.items) && feed.items.length <= 5000);
  const seen = new Set();
  for (const item of feed.items) {
    exactKeys(item, ["number", "title", "kind", "stage", "github_url", "discord_urls"]);
    requireValue(Number.isSafeInteger(item.number) && item.number > 0 && !seen.has(item.number));
    seen.add(item.number);
    requireValue(typeof item.title === "string" && item.title.trim().length > 0 && item.title.length <= 2048);
    requireValue(!/[\u0000-\u001f\u007f]/.test(item.title));
    requireValue(["bug", "feature"].includes(item.kind));
    requireValue(STAGES.some(stage => stage.id === item.stage));
    requireValue(item.github_url === `https://github.com/${REPOSITORY}/issues/${item.number}`);
    requireValue(Array.isArray(item.discord_urls) && item.discord_urls.length <= 100);
    requireValue(new Set(item.discord_urls).size === item.discord_urls.length);
    for (const url of item.discord_urls) {
      requireValue(typeof url === "string" &&
        /^https:\/\/discord\.com\/channels\/1527028230106906704\/[1-9]\d{15,19}\/[1-9]\d{15,19}$/.test(url));
    }
  }
  return feed;
}

export function feedAge(feed, now = Date.now()) {
  const age = now - Date.parse(feed.generated_at);
  return { stale: age > STALE_AFTER_MS, expired: age > EXPIRES_AFTER_MS };
}

export function displayTitle(title) {
  return title.replace(/^\s*\[(?:bug|feature(?: request)?)\]\s*:?\s*/i, "") || title;
}

export function selectItems(items, query = "", kind = "all") {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => (kind === "all" || item.kind === kind) &&
    words.every(word => /^#\d+$/.test(word) ? Number(word.slice(1)) === item.number :
      `${item.title} #${item.number}`.toLocaleLowerCase().includes(word)))
    .sort((a, b) => b.number - a.number);
}

export function pageItems(items, requestedPage = 0) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.max(0, Math.min(Number.isInteger(requestedPage) ? requestedPage : 0, pages - 1));
  return { items: items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), page, pages };
}
