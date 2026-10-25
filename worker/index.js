import * as anilist from "../functions/anilist.js";
import * as myanimelist from "../functions/myanimelist.js";
import * as anilistCallback from "../functions/auth/anilist/callback.js";
import * as malCallback from "../functions/auth/mal/callback.js";
import * as store from "../functions/api/store.js";
import * as redeem from "../functions/api/redeem.js";
import * as publicmetadb from "../functions/publicmetadb.js";
import { handlePairing } from "../functions/_lib/publicmetadb-pairing.js";

const ROUTES = {
  "/anilist": anilist,
  "/myanimelist": myanimelist,
  "/auth/anilist/callback": anilistCallback,
  "/auth/mal/callback": malCallback,
  "/api/store": store,
  "/api/redeem": redeem,
  "/publicmetadb": publicmetadb,
};

const HANDLERS = {
  GET: "onRequestGet",
  POST: "onRequestPost",
  OPTIONS: "onRequestOptions",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/api/publicmetadb/pairing" || path.startsWith("/api/publicmetadb/pairing/")) {
      return handlePairing(request, env);
    }
    const route = ROUTES[path];
    if (route) {
      const handler = route[HANDLERS[request.method]];
      if (handler) return handler({ request, env, ctx });
      const allowed = Object.entries(HANDLERS)
        .filter(([, name]) => route[name])
        .map(([method]) => method);
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: allowed.join(", ") },
      });
    }

    // Static assets are served before this handler. Only unmatched requests
    // reach this fallback; /pair and the app association belong to another Worker.
    const page = await env.ASSETS.fetch(new URL("/404", url));
    const headers = new Headers();
    const type = page.headers.get("content-type");
    if (type) headers.set("content-type", type);
    return new Response(page.body, { status: 404, headers });
  },
};
