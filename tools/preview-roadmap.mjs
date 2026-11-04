import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { validateFeed, feedAge } from "../shared/roadmap.mjs";

const file = process.argv[2];
if (!file) throw new Error("Usage: node tools/preview-roadmap.mjs <verified-feed.json> [port]");
const feed = validateFeed(JSON.parse(await readFile(file, "utf8")));
if (feedAge(feed).expired) throw new Error("Preview evidence is older than seven days. Collect a new verified snapshot.");
const root = resolve("dist");
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".woff2": "font/woff2",
};
const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET" }).end();
      return;
    }
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/api/roadmap") {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ feed, status: feedAge(feed).stale ? "delayed" : "current", preview: true }));
      return;
    }
    let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(root + sep) && path !== root) {
      response.writeHead(403).end();
      return;
    }
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    const content = await readFile(path);
    response.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream" });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") response.writeHead(404).end("Not found");
    else {
      console.error("Preview request failed.", error);
      response.writeHead(500).end("Preview request failed");
    }
  }
});
server.listen(Number(process.argv[3] || 4391), "127.0.0.1", () => {
  console.log(`Roadmap preview: http://127.0.0.1:${server.address().port}/roadmap/`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
