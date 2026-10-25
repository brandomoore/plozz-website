# plozz-website

The marketing website for **[Plozz](https://github.com/brandomoore/Plozz)** — a
free, open-source media player for Apple TV, iPhone, and iPad that plays from
your own Jellyfin, Plex, Emby and Silo servers, network shares and IPTV / Live TV sources.

Live at **[plozz.app](https://plozz.app)**.

User guides live at **[docs.plozz.app](https://docs.plozz.app)** in the separate
[plozz-docs repository](https://github.com/brandomoore/plozz-docs). Its daily
cloud updater reads app source without adding work or gates to app development.
That repository owns the guide content, freshness checks and updater setup.
Provider, network-share and Live TV pages link directly to the relevant setup
guides; keep those task links distinct from marketing and comparison content.

## Stack

- **[Astro](https://astro.build)** — static output, zero JavaScript shipped by default.
- **[astro-icon](https://github.com/natemoo-re/astro-icon)** + `@astrojs/sitemap` for icons and the sitemap.
- **Production hosting:** [Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/) — static assets plus the existing MyAnimeList / AniList OAuth relay.
- **Legacy previews:** Cloudflare Pages still builds the repository, but its `pages.dev` deployment does **not** publish to `plozz.app`.

## Develop

```bash
npm install
npm run dev      # astro dev — http://localhost:4321
```

## Build

```bash
npm run build    # astro build → dist/
npm run preview  # preview the production build locally
```

## Deploy

`plozz.app` and `www.plozz.app` are already bound to the **`plozz-website`
production Worker**, configured by [`wrangler.worker.toml`](wrangler.worker.toml).
The request handler is [`worker/index.js`](worker/index.js); it reuses the
unchanged OAuth functions and lets static assets serve existing files first.

Use an already-authorized Wrangler login or deployment token. Do not create new
credentials or paste tokens into source. Check the active Worker version and
bindings before uploading, and retain that version ID as the rollback reference.

```bash
npm ci
npm test
npm run build
npm run worker:check                  # bundle/config validation, no upload
npm run worker:upload                 # rebuild, test, upload an INACTIVE version
npm run worker:deploy -- <version-id>@100 --yes
```

Inspect the uploaded version's bindings before activating it. `keep_vars`
preserves the existing `ANILIST_CLIENT_ID` and `MAL_CLIENT_ID`; Worker version
uploads retain `MAL_CLIENT_SECRET` without reading or replacing its value.
`AUTH_KV` keeps its existing namespace, including in-flight authorizations.
If new production bindings appear, incorporate them before uploading rather
than deleting them with an older config.

Version upload/deploy is deliberate: it doesn't synchronize DNS, custom domains
or route settings. **Do not replace it with `wrangler deploy` or add route/domain
declarations.** `/pair` and `/.well-known/apple-app-site-association` belong to
the separate `plozz-pairing-links` Worker and must remain untouched.

After activation, verify `https://plozz.app/`, `/silo/`, refreshed pages/assets,
both hostnames, and the pairing page/association. Test OAuth only with missing
inputs, unsupported methods and OPTIONS; don't complete a real authorization
or redeem a user's code as a deployment check. Local tests use mocked KV.

To roll back, activate the recorded previous version:

```bash
npm run worker:deploy -- <previous-version-id>@100 --yes
```

The existing Pages integration still builds `main` using `npm run build` and
[`wrangler.toml`](wrangler.toml), but its custom-domain binding is deactivated.
A green **Cloudflare Pages** GitHub check proves only that preview deployment
succeeded. Production publication is the explicit Worker upload/activation
above; there is no credentialed Worker GitHub Actions workflow in this repo.
Do not reactivate the Pages domain or change DNS to resolve a stale Worker.

## Structure

### PublicMetaDB browser pairing

`/publicmetadb` lets a user paste their own API key from any modern browser.
`public/publicmetadb-pair.js` encrypts it for the requesting app before sending
it to `/api/publicmetadb/pairing`. The relay never receives the plaintext key.
The website serves the encryption code and is still a trusted party.
No history, playback consent or PublicMetaDB account creation is performed here.

The non-public `plozz-publicmetadb-pairing` Worker owns the
`PUBLICMETADB_PAIRING` Durable Object and its `publicmetadb-pairing-v1` SQLite
migration. Both initial provisioning and website activation require explicit
production deployment approval. The separate state owner is deliberate:
`wrangler versions upload` cannot apply a new Durable Object migration, and the
website's version-only publishing must not be replaced with a route-synchronizing
deploy. The state Worker has no domains, routes, workers.dev or preview URLs.

After approval, provision only the new state Worker with
`wrangler deploy --config wrangler.pairing.toml`, then use the website's existing
inactive version upload, binding inspection, and explicit activation procedure.
Retain the previous website version as rollback; it does not need the new state
binding. Do not delete the state namespace to roll back the website.
Keep `AUTH_KV`, existing secrets, and the separate pairing-links Worker unchanged.
A missing binding returns 503; do not claim pairing is live before the website
version is activated. Legacy Pages previews do not host this new API.

Sessions expire after ten minutes. Eight-character codes locate only public
keys and encrypted envelopes; a separate random 256-bit app secret authorizes
redemption/cancellation. One Durable Object per code serializes consumption,
submission and revocation. Alarms delete temporary state, and every operation
also checks expiry. Per-client-IP hashed rate objects bound requests and creation;
raw IPs, API keys and app secrets are not stored or logged by this handler.
Body limits, no-store responses, same-origin browser requests, CSP, and no
third-party scripts keep the key-entry surface narrow.

Protocol v1 uses P-256 ECDH, HKDF-SHA256 and AES-256-GCM. Public keys use X9.63,
all binary values use canonical unpadded base64url, HKDF salt is the code,
info is `plozz-publicmetadb-pairing-v1`, and GCM AAD is that info plus `:` and
the code. The envelope combines a 12-byte nonce, 63-byte ciphertext and 16-byte
tag. QR fragments pin the app public key; manually entered codes rely on HTTPS.
The browser clears the field on submission and navigation, uses no persistent
storage, and does not automatically retry a possibly accepted handoff.

`npm test` includes synthetic browser crypto, routing, atomic-replay,
cancellation, expiry, malformed-input and rate-limit checks. These are not
real-account acceptance or evidence of production activation.

```
src/pages/          One .astro file per route (index, features, formats,
                    jellyfin, plex, emby, silo, network-shares,
                    infuse-alternative, apple-tv-media-players, live-tv, privacy, 404)
src/components/      Reusable page sections
src/data/           Site copy, FAQs, and the screenshot manifest
src/styles/          Global and device-frame CSS
public/              Static assets + the generated screenshots/ ladders
functions/           Shared OAuth handlers (also used by legacy Pages previews)
worker/              Production Worker router and static-asset 404 fallback
tests/               Worker routing and mocked OAuth/KV regression tests
screenshots-src/     Pristine screenshot masters (not shipped in the build)
tools/               Build scripts: screenshot encoders, OG image, font sheet
```

## Content

[`PRODUCT.md`](PRODUCT.md) owns the voice and claim boundaries. Provider links
and format data live in [`src/data/site.ts`](src/data/site.ts). The homepage
renders [`src/data/faqs.ts`](src/data/faqs.ts) as both visible answers and
FAQPage structured data; keep those together.

Public Discord links use `https://plozz.app/discord`, never a raw invite.
The destination is owned by the separate `plozz-pairing-links` Worker in
the Plozz app repository (`web/pairing-links`), so changing an invite doesn't
require another website or app link change.

`https://plozz.app/testflight` (with or without a trailing slash) redirects to
the current public beta invite. This shortcut is owned here, in
`public/_redirects`, and uses a temporary 302 so the invite can change later.
Keep its destination aligned with `TESTFLIGHT_URL` in `src/data/site.ts`.
Cloudflare applies the rules before the website Worker; no pairing routes,
OAuth handlers or domain settings need to change.

[`src/pages/infuse-alternative.astro`](src/pages/infuse-alternative.astro) is the
landing page for free/open-source Apple TV player alternatives. Its visible
questions and FAQ structured data share one list. Keep competitor references
factual, avoid price comparisons and feature-parity promises, and preserve the
internal links from Home and the broader comparison page.

[`src/pages/apple-tv-media-players.astro`](src/pages/apple-tv-media-players.astro)
compares Infuse, VLC, Plex, Emby and Swiftfin by workflow rather than price or
unsupported feature checklists. Each entry links its official source and gives
a use case, a reason to try Plozz, and a caveat. Infuse remains the lead
comparison. Features and the shared footer link to this broader page.

[`src/pages/live-tv.astro`](src/pages/live-tv.astro) covers IPTV / Live TV,
including M3U/Xtream sources, XMLTV, Multiview and scheduled library channels.
Keep it discoverable in the primary navigation and homepage, and include
IPTV / Live TV in social artwork. Plozz supplies the player, not the channels.

Run `npm run test:site` to build and check search/social metadata, canonical
URLs, sitemap discovery, visible FAQ/JSON-LD consistency and comparison wording.

Audio copy must follow the editorial scope in `PRODUCT.md`, even when upstream
source describes additional capabilities. Keep device/output qualifications
beside supported formats and keep visible FAQs consistent with their JSON-LD.

The September 23, 2026 refresh follows app release/041. Platform and provider
limits belong beside their features, especially mobile-only streaming quality
and downloads, native Silo capabilities, server-owned identities and optional
history sync. Keep the public TestFlight link rather than promising that the
latest internal build has cleared external review.

Social cards use the current site logo and the bundled Manrope font, with the
same neutral styling as the website. The pixel wordmark and blue glow are no
longer used:

```bash
npm run og
node tools/build-og.mjs --check
```

Keep `COPY` in [`tools/build-og.mjs`](tools/build-og.mjs) aligned with the
homepage and the image alternative in [`src/data/brand.ts`](src/data/brand.ts).
Regenerate both SVG and PNG after changing it. Manrope is embedded in the SVG
so exports don't depend on installed fonts or an external font service.

`brand.ts` derives content hashes from the committed PNG and shared logo at build time.
Open Graph, Twitter and the app's structured data use that same versioned image
URL; header, footer, favicon and other site marks use the versioned logo URL.
This gives changed artwork a new cache key; existing Discord messages
may still retain their old unfurl until Discord refreshes it.

The logo is imported unchanged from
[`brandomoore/brando/logos/plozz.svg`](https://github.com/brandomoore/brando/blob/7b26334e4cb6ed73a8e9633227ca402cda9e5776/logos/plozz.svg).
Update `public/logo.svg` from the canonical artwork rather than redrawing it;
the site and social card share that file.

## Screenshots

Public credits for the real-film demonstration imagery used on the website and
in App Store assets live at [`/media-credits`](https://plozz.app/media-credits/), backed by
`src/data/media-credits.ts`. Preserve creator credit, source and license links,
and the extraction/cropping notices when updating that selection. These are
artwork-source credits, not claims of service integration or endorsement.

Pristine masters live in [`screenshots-src/`](screenshots-src/) and are **not**
shipped as-is — Astro serves the re-encoded ladders under `public/screenshots/`.
Only reviewed real-app captures with documented media reuse rights may be published.
`npm run build` verifies their source and derivative hashes before building pages.
Two scripts drive that:

```bash
npm run images                       # re-encode the masters (only what changed)
npm run images -- --force            # re-encode everything
npm run images -- --only plozz-demo-tv-home
npm run shots -- --from /path/to/reviewed-captures
```

- **`npm run images`** ([`tools/build-images.mjs`](tools/build-images.mjs)) is
  the encoder: it turns each master into a responsive AVIF + WebP width ladder.
  Its encoder settings were tuned by measuring DSSIM against the masters rather
  than by eye.
- **`npm run shots`** ([`tools/sync-shots.mjs`](tools/sync-shots.mjs)) verifies an
  explicitly supplied capture directory and its reviewed provenance before
  copying changed masters and re-encoding. It never defaults to a personal
  media server or an unrelated app checkout.

See [`screenshots-src/README.md`](screenshots-src/README.md) for the master
conventions.

## License

MIT — see [LICENSE](LICENSE).

<!-- app-family:start -->
<!-- Generated by https://github.com/brandomoore/brando — edit apps.json there, not this block. -->

---

<p align="center"><b>More open source</b></p>

<p align="center">
  <a href="https://github.com/brandomoore/Hozz" title="Hozz — Apple Health, exported to storage you own"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/brandomoore/brando/main/logos/lockups/hozz-dark.svg" /><img src="https://raw.githubusercontent.com/brandomoore/brando/main/logos/lockups/hozz-light.svg" height="40" alt="Hozz" /></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/brandomoore/Mozz" title="Mozz — Your music, wherever it lives"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/brandomoore/brando/main/logos/lockups/mozz-dark.svg" /><img src="https://raw.githubusercontent.com/brandomoore/brando/main/logos/lockups/mozz-light.svg" height="40" alt="Mozz" /></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/brandomoore/Plozz" title="Plozz — Movies &amp; TV on Apple TV, iPhone &amp; iPad"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/brandomoore/brando/main/logos/lockups/plozz-dark.svg" /><img src="https://raw.githubusercontent.com/brandomoore/brando/main/logos/lockups/plozz-light.svg" height="40" alt="Plozz" /></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/brandomoore/strozz" title="Strozz — Twitch on Apple TV, with real emotes"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/brandomoore/brando/main/logos/lockups/strozz-dark.svg" /><img src="https://raw.githubusercontent.com/brandomoore/brando/main/logos/lockups/strozz-light.svg" height="40" alt="Strozz" /></picture></a>
</p>

<p align="center">
  <a href="https://brando.page">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/brandomoore/brando/main/logos/brando-white.svg" />
      <img src="https://raw.githubusercontent.com/brandomoore/brando/main/logos/brando-black.svg" height="22" alt="Brandon Moore" />
    </picture>
  </a>
</p>
<!-- app-family:end -->
