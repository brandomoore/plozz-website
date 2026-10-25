const CONTEXT = "plozz-publicmetadb-pairing-v1";
const CODE = /^[A-HJ-NP-Z2-9]{8}$/;

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid pairing response. Start again in Plozz.");
  const bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  if (encode(bytes) !== value) throw new Error("Invalid pairing response. Start again in Plozz.");
  return bytes;
}

export async function sealKey(key, recipient, code) {
  if (!/^pm-[A-Za-z0-9]{60}$/.test(key) || !CODE.test(code)) {
    throw new Error("Paste the complete PublicMetaDB API key, beginning with pm-.");
  }
  const raw = decode(recipient);
  if (raw.length !== 65) throw new Error("Invalid pairing response. Start again in Plozz.");
  const receiver = await crypto.subtle.importKey("raw", raw, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sender = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: receiver }, sender.privateKey, 256);
  const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  const info = new TextEncoder().encode(CONTEXT);
  const salt = new TextEncoder().encode(code);
  const aes = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(key);
  try {
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`${CONTEXT}:${code}`), tagLength: 128 },
      aes, plaintext
    ));
    const sealed = new Uint8Array(iv.length + encrypted.length);
    sealed.set(iv);
    sealed.set(encrypted, iv.length);
    return {
      version: 1,
      publicKey: encode(new Uint8Array(await crypto.subtle.exportKey("raw", sender.publicKey))),
      sealed: encode(sealed),
    };
  } finally { plaintext.fill(0); }
}

export function startPairingPage() {
  const codeForm = document.querySelector("#code-form");
  const keyForm = document.querySelector("#key-form");
  const codeInput = document.querySelector("#code");
  const keyInput = document.querySelector("#key");
  const message = document.querySelector("#message");
  const restart = document.querySelector("#restart");
  const fragment = new URLSearchParams(location.hash.slice(1));
  let pinnedKey = fragment.get("key");
  codeInput.value = fragment.get("code") ?? "";
  history.replaceState(null, "", location.pathname);
  let pairing = null;
  let busy = false;
  let active = true;
  const controllers = new Set();

  async function request(path, options = {}) {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(path, {
        ...options, cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal,
      });
      if (!response.ok) throw new Error(errorText(response.status));
      return await response.json();
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  }

  function errorText(status) {
    if (status === 429) return "Too many attempts. Wait a few minutes, then start again in Plozz.";
    if (status === 410) return "This pairing code expired or was already used. Start again in Plozz.";
    if (status === 503) return "Pairing unavailable. Enter the key in Plozz.";
    return "Pairing failed. Start again in Plozz.";
  }

  codeForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const button = codeForm.querySelector("button");
    button.disabled = true;
    message.textContent = "Checking code…";
    try {
      const code = codeInput.value.toUpperCase().replace(/[\s-]/g, "");
      if (!CODE.test(code)) throw new Error("Enter the eight-character code shown in Plozz.");
      const value = await request(`/api/publicmetadb/pairing/${code}`);
      if (!active) return;
      if (!Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()
          || value.expiresAt > Date.now() + 610000 || (pinnedKey && pinnedKey !== value.publicKey)) {
        throw new Error("This code doesn't match your Plozz device. Start again in Plozz.");
      }
      if (decode(value.publicKey).length !== 65) throw new Error("Invalid pairing response. Start again in Plozz.");
      pairing = { ...value, code };
      codeForm.hidden = true;
      keyForm.hidden = false;
      restart.hidden = false;
      document.querySelector("#paired-code").textContent = `${code.slice(0, 4)} ${code.slice(4)}`;
      message.textContent = "";
      keyInput.focus();
    } catch (error) {
      message.textContent = error instanceof TypeError || error.name === "AbortError"
        ? "Couldn't reach Plozz. Check your connection and try again." : error.message;
    } finally { busy = false; button.disabled = false; }
  });

  keyForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !pairing) return;
    busy = true;
    const button = keyForm.querySelector("button");
    button.disabled = true;
    restart.disabled = true;
    let dispatched = false;
    try {
      if (Date.now() >= pairing.expiresAt) throw new Error(errorText(410));
      const envelope = await sealKey(keyInput.value.trim(), pairing.publicKey, pairing.code);
      keyInput.value = "";
      if (!active || !pairing) return;
      dispatched = true;
      await request(`/api/publicmetadb/pairing/${pairing.code}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });
      keyForm.hidden = true;
      message.textContent = "Key sent. Check Plozz.";
      pairing = null;
      pinnedKey = null;
    } catch (error) {
      message.textContent = dispatched && (error instanceof TypeError || error.name === "AbortError" || error instanceof SyntaxError)
        ? "Delivery couldn't be confirmed. Check Plozz before starting a new pairing."
        : error.message;
    } finally { busy = false; button.disabled = false; restart.disabled = false; }
  });
  restart.addEventListener("click", () => {
    if (busy) return;
    pairing = null;
    pinnedKey = null;
    keyInput.value = "";
    codeInput.value = "";
    keyForm.hidden = true;
    codeForm.hidden = false;
    restart.hidden = true;
    message.textContent = "";
    codeInput.focus();
  });
  window.addEventListener("pagehide", () => {
    active = false;
    keyInput.value = "";
    pairing = null;
    pinnedKey = null;
    for (const controller of controllers) controller.abort();
  });
  window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
  if (!window.isSecureContext || !crypto.subtle) {
    codeForm.hidden = true;
    message.textContent = "Open this page over HTTPS, or enter your API key directly in Plozz.";
  }
}

if (typeof document !== "undefined") startPairingPage();
