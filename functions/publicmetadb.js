export function onRequestGet() {
  return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Connect PublicMetaDB · Plozz</title>
  <link rel="stylesheet" href="/publicmetadb-pair.css">
  <script type="module" src="/publicmetadb-pair.js"></script>
</head>
<body>
  <main>
    <img src="/logo.svg" width="48" height="48" alt="Plozz">
    <h1>PublicMetaDB</h1>
    <form id="code-form">
      <label for="code">Pairing code</label>
      <input id="code" name="code" inputmode="text" autocomplete="off" autocapitalize="characters"
        spellcheck="false" maxlength="11" required placeholder="ABCD EFGH" aria-describedby="message">
      <button type="submit">Continue</button>
    </form>
    <form id="key-form" hidden>
      <div id="paired-code" class="code" aria-label="Pairing code"></div>
      <p><a href="https://publicmetadb.com/settings" target="_blank"
        rel="noopener noreferrer">Get an API key</a></p>
      <label for="key">API key</label>
      <input id="key" name="key" type="password" autocomplete="off" autocapitalize="none"
        spellcheck="false" maxlength="100" required aria-describedby="privacy message">
      <p id="privacy" class="note">Encrypted for your device.</p>
      <button type="submit">Send to Plozz</button>
    </form>
    <button id="restart" type="button" class="secondary" hidden>Use another code</button>
    <p id="message" role="status" aria-live="polite"></p>
    <noscript>This page needs JavaScript to encrypt your key. You can also enter the key directly in Plozz.</noscript>
  </main>
</body>
</html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}
