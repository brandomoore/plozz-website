# plozz-website

The marketing website for **[Plozz](https://github.com/brandomoore/Plozz)** — a
free, open-source media player for Apple TV, iPhone, and iPad that plays from
your own Jellyfin, Plex, Emby and Silo servers and from plain network shares.

Live at **[plozz.app](https://plozz.app)**.

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

```
src/pages/          One .astro file per route (index, features, formats,
                    jellyfin, plex, emby, silo, network-shares,
                    infuse-alternative, apple-tv-media-players, privacy, 404)
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

Run `npm run test:site` to build and check search/social metadata, canonical
URLs, sitemap discovery, visible FAQ/JSON-LD consistency and comparison wording.

The September 23, 2026 refresh follows app release/041. Platform and provider
limits belong beside their features, especially mobile-only streaming quality
and downloads, native Silo capabilities, server-owned identities and optional
history sync. Keep the public TestFlight link rather than promising that the
latest internal build has cleared external review.

Social cards are generated from the site logo and wordmark:

```bash
npm run og
node tools/build-og.mjs --check
```

Keep `COPY` in [`tools/build-og.mjs`](tools/build-og.mjs) aligned with
[`src/layouts/Layout.astro`](src/layouts/Layout.astro). Regenerate both the SVG
and PNG after changing it.

## Screenshots

Pristine masters live in [`screenshots-src/`](screenshots-src/) and are **not**
shipped as-is — Astro serves the re-encoded ladders under `public/screenshots/`.
Two scripts drive that:

```bash
npm run images                       # re-encode the masters (only what changed)
npm run images -- --force            # re-encode everything
npm run images -- --only plozz-tv-home
npm run shots                        # pull fresh captures from ../Plozz, then re-encode
```

- **`npm run images`** ([`tools/build-images.mjs`](tools/build-images.mjs)) is
  the encoder: it turns each master into a responsive AVIF + WebP width ladder.
  Its encoder settings were tuned by measuring DSSIM against the masters rather
  than by eye.
- **`npm run shots`** ([`tools/sync-shots.mjs`](tools/sync-shots.mjs)) pulls
  freshly captured PNGs out of the Plozz app repo (`../Plozz`, via that repo's
  `tools/capture-shots.sh`), copies the changed masters in, and re-encodes.

See [`screenshots-src/README.md`](screenshots-src/README.md) for the master
conventions.

## License

MIT — see [LICENSE](LICENSE).

<!-- app-family:start -->
<!-- Generated by https://github.com/thatcube/brando — edit apps.json there, not this block. -->

---

<p align="center"><b>More open source</b></p>

<p align="center">
  <a href="https://github.com/thatcube/hozz" title="Hozz — Apple Health, exported to storage you own"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/thatcube/brando/main/logos/lockups/hozz-dark.svg" /><img src="https://raw.githubusercontent.com/thatcube/brando/main/logos/lockups/hozz-light.svg" height="40" alt="Hozz" /></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/thatcube/Mozz" title="Mozz — Your music, wherever it lives"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/thatcube/brando/main/logos/lockups/mozz-dark.svg" /><img src="https://raw.githubusercontent.com/thatcube/brando/main/logos/lockups/mozz-light.svg" height="40" alt="Mozz" /></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/thatcube/Plozz" title="Plozz — Movies &amp; TV on Apple TV, iPhone &amp; iPad"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/thatcube/brando/main/logos/lockups/plozz-dark.svg" /><img src="https://raw.githubusercontent.com/thatcube/brando/main/logos/lockups/plozz-light.svg" height="40" alt="Plozz" /></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/thatcube/Twozz" title="Twozz — Twitch on Apple TV, with real emotes"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/thatcube/brando/main/logos/lockups/twozz-dark.svg" /><img src="https://raw.githubusercontent.com/thatcube/brando/main/logos/lockups/twozz-light.svg" height="40" alt="Twozz" /></picture></a>
</p>

<p align="center">
  <a href="https://brando.page">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/thatcube/brando/main/logos/brando-white.svg" />
      <img src="https://raw.githubusercontent.com/thatcube/brando/main/logos/brando-black.svg" height="22" alt="Brandon Moore" />
    </picture>
  </a>
</p>
<!-- app-family:end -->
