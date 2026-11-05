import { EDITABLE_STAGES, SEVERITIES, SEVERITY_OVERRIDES, severityFromLabels } from "../shared/roadmap.mjs";
import { handleRoadmap } from "./roadmap.js";

const ORIGIN = "https://plozz.app";
const CALLBACK = `${ORIGIN}/auth/roadmap/callback`;
const REPO = "/repos/brandomoore/Plozz";
const OWNER_ID = 16313090;
const SESSION_COOKIE = "__Host-roadmap-session";
const STATE_COOKIE = "__Host-roadmap-state";
const LABELS = { planned: "roadmap: planned", "in-progress": "roadmap: in progress" };
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();

class EditorError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function headers() {
  return new Headers({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: headers() });
}

function cookie(name, value, seconds) {
  return `${name}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`;
}

function redirect(url, cookies = []) {
  const h = headers();
  h.set("Location", url);
  for (const value of cookies) h.append("Set-Cookie", value);
  return new Response(null, { status: 303, headers: h });
}

function base64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function unbase64(value) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
}

function random() {
  return base64(crypto.getRandomValues(new Uint8Array(32)));
}

async function digest(value) {
  return base64(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function readCookie(request, name, pattern = /^[A-Za-z0-9_-]{43}$/) {
  const values = (request.headers.get("Cookie") || "").split(";")
    .map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
  const value = values.length === 1 ? values[0].slice(name.length + 1) : "";
  return pattern.test(value) ? value : null;
}

function configured(env) {
  return Boolean(env.ROADMAP_AUTH && env.GITHUB_ROADMAP_CLIENT_ID && env.GITHUB_ROADMAP_CLIENT_SECRET &&
    /^[A-Za-z0-9_-]{43}$/.test(env.ROADMAP_SESSION_KEY || ""));
}

async function sessionKey(env) {
  return crypto.subtle.importKey("raw", unbase64(env.ROADMAP_SESSION_KEY), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(env, value, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({
    name: "AES-GCM", iv, additionalData: encoder.encode(purpose),
  }, await sessionKey(env), encoder.encode(JSON.stringify(value)));
  return `${base64(iv)}.${base64(encrypted)}`;
}

async function open(env, value, purpose) {
  const [iv, encrypted] = value.split(".");
  const plain = await crypto.subtle.decrypt({
    name: "AES-GCM", iv: unbase64(iv), additionalData: encoder.encode(purpose),
  }, await sessionKey(env), unbase64(encrypted));
  return JSON.parse(new TextDecoder().decode(plain));
}

async function record(env, kind, id) {
  const key = `${kind}:${await digest(id)}`;
  const value = await env.ROADMAP_AUTH.get(key);
  return { key, value: value ? await open(env, value, key) : null };
}

async function store(env, kind, id, value, seconds) {
  const key = `${kind}:${await digest(id)}`;
  await env.ROADMAP_AUTH.put(key, await seal(env, value, key), { expirationTtl: seconds });
}

async function readBody(request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json") || !request.body) {
    throw new EditorError(400, "invalid_body", "A JSON stage change is required.");
  }
  const reader = request.body.getReader();
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) throw new EditorError(413, "body_too_large", "The stage change is too large.");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new EditorError(400, "invalid_json", "The stage change is not valid JSON.");
  }
}

function stageOf(issue) {
  const labels = issue.labels.map(label => label.name);
  const stages = Object.keys(LABELS).filter(stage => labels.includes(LABELS[stage]));
  if (stages.length > 1) throw new EditorError(409, "conflicting_labels", "This issue has conflicting stage labels. Resolve them on GitHub.");
  return stages[0] || "backlog";
}

function severityOf(issue) {
  try {
    return severityFromLabels(issue.labels);
  } catch {
    throw new EditorError(409, "conflicting_severity", "This issue has conflicting severity labels. Resolve them on GitHub.");
  }
}

export async function handleRoadmapEditor(request, env, ctx, { fetcher = fetch, now = Date.now() } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const login = path === "/auth/roadmap/login";
  const callback = path === "/auth/roadmap/callback";
  const sessionRoute = path === "/api/roadmap/editor/session";
  const logout = path === "/api/roadmap/editor/logout";
  const issueMatch = path.match(/^\/api\/roadmap\/editor\/issues\/([1-9]\d{0,9})$/);
  const expectedMethod = login || callback || sessionRoute ? "GET" : logout ? "POST" : issueMatch ? "PATCH" : null;
  if (!expectedMethod) return json({ error: "not_found" }, 404);
  if (request.method !== expectedMethod) {
    const result = json({ error: "method_not_allowed" }, 405);
    result.headers.set("Allow", expectedMethod);
    return result;
  }
  if (!configured(env)) {
    if (login || callback) return redirect(`${ORIGIN}/roadmap/?editor=not-configured`, [cookie(STATE_COOKIE, "", 0)]);
    if (sessionRoute) return json({ configured: false, authenticated: false });
    return json({ error: "not_configured", message: "Roadmap editing needs GitHub setup." }, 503);
  }
  if (url.origin !== ORIGIN) {
    if (login) return redirect(`${ORIGIN}/auth/roadmap/login`);
    if (sessionRoute) return json({ configured: true, authenticated: false });
    return json({ error: "wrong_origin", message: "Edit the board at plozz.app." }, 403);
  }
  const signal = AbortSignal.timeout(20_000);
  async function github(path, token, options = {}) {
    const result = await fetcher(`https://api.github.com${path}`, {
      ...options, signal: options.signal || signal, redirect: "manual",
      headers: {
        Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Plozz-Roadmap", Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!result.ok) {
      throw new EditorError(result.status === 401 ? 401 : 502, "github_error",
        result.status === 401 ? "Your GitHub session expired. Sign in again." :
          "GitHub could not complete the request. Check the issue before trying again.");
    }
    return result.status === 204 ? null : result.json();
  }
  async function owner(token) {
    const user = await github("/user", token);
    if (user.id !== OWNER_ID || user.login !== "brandomoore") {
      throw new EditorError(403, "not_maintainer", "Only the brandomoore maintainer account can edit this board.");
    }
    return user;
  }
  try {
    if (login) {
      const state = random();
      const verifier = random();
      const pending = await seal(env, { state, verifier, expires: now + 600_000 }, "oauth-state");
      const authorization = new URL("https://github.com/login/oauth/authorize");
      for (const [key, value] of Object.entries({
        client_id: env.GITHUB_ROADMAP_CLIENT_ID, redirect_uri: CALLBACK, state,
        code_challenge: await digest(verifier), code_challenge_method: "S256",
        login: "brandomoore", allow_signup: "false",
      })) authorization.searchParams.set(key, value);
      return redirect(authorization.href, [cookie(STATE_COOKIE, pending, 600)]);
    }
    if (callback) {
      const stateCookie = readCookie(request, STATE_COOKIE, /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{32,1024}$/);
      const pending = stateCookie ? await open(env, stateCookie, "oauth-state") : null;
      if (!pending || url.searchParams.getAll("state").length !== 1 || url.searchParams.get("state") !== pending.state) {
        throw new EditorError(400, "invalid_state", "Sign-in could not be verified. Try again.");
      }
      if (pending.expires <= now) {
        throw new EditorError(400, "expired_state", "Sign-in expired. Try again.");
      }
      if (url.searchParams.has("error")) return redirect(`${ORIGIN}/roadmap/?editor=denied`, [cookie(STATE_COOKIE, "", 0)]);
      const code = url.searchParams.get("code");
      if (url.searchParams.getAll("code").length !== 1 || !code || code.length > 256) {
        throw new EditorError(400, "missing_code", "GitHub did not provide an authorization code.");
      }
      const exchanged = await fetcher("https://github.com/login/oauth/access_token", {
        method: "POST", redirect: "manual", signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_ROADMAP_CLIENT_ID, client_secret: env.GITHUB_ROADMAP_CLIENT_SECRET,
          code, redirect_uri: CALLBACK, code_verifier: pending.verifier, repository_id: 1275907950,
        }),
      });
      if (!exchanged.ok) throw new EditorError(502, "token_exchange", "GitHub sign-in failed.");
      const credentials = await exchanged.json();
      if (!/^ghu_[A-Za-z0-9_]+$/.test(credentials.access_token || "") ||
          !Number.isInteger(credentials.expires_in) || credentials.expires_in < 60) {
        throw new EditorError(502, "invalid_token", "Configure an expiring GitHub App user token.");
      }
      await owner(credentials.access_token);
      const seconds = Math.min(SESSION_SECONDS, credentials.expires_in);
      const id = random();
      await store(env, "session", id, {
        token: credentials.access_token, csrf: random(), expires: now + seconds * 1000,
      }, seconds);
      const previous = readCookie(request, SESSION_COOKIE);
      if (previous) await env.ROADMAP_AUTH.delete(`session:${await digest(previous)}`);
      return redirect(`${ORIGIN}/roadmap/?editor=ready`, [cookie(STATE_COOKIE, "", 0), cookie(SESSION_COOKIE, id, seconds)]);
    }

    if (url.search || (request.headers.has("Origin") && request.headers.get("Origin") !== ORIGIN)) {
      throw new EditorError(403, "invalid_origin", "Use the roadmap editor at plozz.app.");
    }
    const id = readCookie(request, SESSION_COOKIE);
    const saved = id ? await record(env, "session", id) : null;
    const session = saved?.value;
    if (!session || session.expires <= now) {
      if (sessionRoute) return json({ configured: true, authenticated: false });
      throw new EditorError(401, "signed_out", "Sign in with GitHub to edit the board.");
    }
    if (!sessionRoute && (request.headers.get("Origin") !== ORIGIN ||
        request.headers.get("X-Roadmap-CSRF") !== session.csrf)) {
      throw new EditorError(403, "csrf", "The editing request could not be verified. Reload the page.");
    }
    try {
      await owner(session.token);
    } catch (error) {
      if (!(logout && error instanceof EditorError && error.status === 401)) throw error;
    }
    if (sessionRoute) return json({ configured: true, authenticated: true, csrf: session.csrf, user: { login: "brandomoore" } });
    if (logout) {
      const revoked = await fetcher(`https://api.github.com/applications/${env.GITHUB_ROADMAP_CLIENT_ID}/token`, {
        method: "DELETE", redirect: "manual", signal,
        headers: {
          Accept: "application/vnd.github+json", "User-Agent": "Plozz-Roadmap",
          Authorization: `Basic ${btoa(`${env.GITHUB_ROADMAP_CLIENT_ID}:${env.GITHUB_ROADMAP_CLIENT_SECRET}`)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: session.token }),
      });
      if (!revoked.ok && revoked.status !== 404) throw new EditorError(502, "revoke_failed", "Sign-out could not finish. Try again.");
      await env.ROADMAP_AUTH.delete(saved.key);
      const result = json({ signed_out: true });
      result.headers.append("Set-Cookie", cookie(SESSION_COOKIE, "", 0));
      return result;
    }

    const body = await readBody(request);
    const severityEdit = body && Object.keys(body).sort().join(",") === "expectedOverride,severityOverride";
    if (severityEdit) {
      if (![null, ...SEVERITIES].includes(body.severityOverride) || ![null, ...SEVERITIES].includes(body.expectedOverride)) {
        throw new EditorError(400, "invalid_severity", "Choose Automatic, Blocking, Major, or No badge.");
      }
    } else if (!body || Object.keys(body).sort().join(",") !== "expectedStage,stage" ||
        !EDITABLE_STAGES.includes(body.stage) || !EDITABLE_STAGES.includes(body.expectedStage)) {
      throw new EditorError(400, "invalid_stage", "Only Backlog, Planned, and In progress can be chosen manually.");
    }
    const number = Number(issueMatch[1]);
    const snapshot = await handleRoadmap(new Request(`${ORIGIN}/api/roadmap`), ctx, {
      fetcher: (url, options) => fetcher(url, { ...options, signal }), now,
    });
    if (!snapshot.ok) throw new EditorError(503, "feed_unavailable", "The verified board is unavailable. Try again after it recovers.");
    const item = (await snapshot.json()).feed.items.find(item => item.number === number);
    if (!item || !EDITABLE_STAGES.includes(item.stage)) {
      throw new EditorError(409, "protected_stage", "This item is not editable. Beta and release stages are verified automatically.");
    }
    const issuePath = `${REPO}/issues/${number}`;
    const issue = await github(issuePath, session.token);
    if (issue.pull_request || issue.state !== "open" || issue.labels.some(label => label.name === "duplicate") ||
        !issue.labels.some(label => ["bug", "enhancement"].includes(label.name))) {
      throw new EditorError(409, "ineligible_issue", "This issue is no longer an open roadmap item.");
    }
    const current = severityEdit ? severityOf(issue).severity_override : stageOf(issue);
    const expected = severityEdit ? body.expectedOverride : body.expectedStage;
    const target = severityEdit ? body.severityOverride : body.stage;
    const labels = severityEdit ? SEVERITY_OVERRIDES : LABELS;
    if (current !== expected) {
      throw new EditorError(409, "item_changed", "This setting changed on GitHub. Wait for the board to sync before editing it.");
    }
    if (current !== target) {
      // Change only this setting's labels; preserve concurrent triage and integration labels.
      if (labels[target]) await github(`${issuePath}/labels`, session.token, {
        method: "POST", body: JSON.stringify({ labels: [labels[target]] }),
      });
      if (labels[current]) {
        try {
          await github(`${issuePath}/labels/${encodeURIComponent(labels[current])}`, session.token, { method: "DELETE" });
        } catch (error) {
          if (labels[target]) {
            try {
              const recoverySignal = AbortSignal.timeout(5_000);
              const latest = await github(issuePath, session.token, { signal: recoverySignal });
              if (latest.labels.some(label => label.name === labels[current])) {
                await github(`${issuePath}/labels/${encodeURIComponent(labels[target])}`, session.token, {
                  method: "DELETE", signal: recoverySignal,
                });
              }
            } catch {
              console.error("Roadmap editor label rollback failed; manual verification required.");
            }
          }
          throw error;
        }
      }
    }
    const verified = await github(issuePath, session.token);
    const verifiedValue = severityEdit ? severityOf(verified).severity_override : stageOf(verified);
    if (verifiedValue !== target) {
      throw new EditorError(409, "save_conflict", "The saved setting changed. Check the labels on GitHub before trying again.");
    }
    if (severityEdit) return json({ number, ...severityOf(verified), saved_at: new Date(now).toISOString() });
    return json({ number, stage: body.stage, saved_at: new Date(now).toISOString() });
  } catch (error) {
    const known = error instanceof EditorError;
    console.error("Roadmap editor request failed:", known ? error.code : "runtime_error");
    if (callback) return redirect(`${ORIGIN}/roadmap/?editor=${known && error.code === "not_maintainer" ? "denied" : "failed"}`, [cookie(STATE_COOKIE, "", 0)]);
    if (sessionRoute && known && error.status === 401) {
      const result = json({ configured: true, authenticated: false });
      result.headers.append("Set-Cookie", cookie(SESSION_COOKIE, "", 0));
      return result;
    }
    return json({
      error: known ? error.code : "editor_unavailable",
      message: known ? error.message : "Editing could not finish. Check the issue on GitHub before trying again.",
    }, known ? error.status : 503);
  }
}
