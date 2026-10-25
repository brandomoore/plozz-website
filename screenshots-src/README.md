# Reviewed screenshot originals

These are real Plozz simulator framebuffer captures. The demonstration library
contains real films, with licensed contemporary film frames and historical
public-domain artwork. Posters and backdrops are cropped full-bleed, not padded
with black bars. No controls, film titles or ratings are painted into captures.

See [media-credits.json](media-credits.json) and the public
[media credits](https://plozz.app/media-credits/) for creators, source evidence,
licenses and adaptations. Third-party media is **not** covered by the
repository's MIT license. Plozz's interface retains the app project's license.
These records do not guarantee worldwide clearance or App Store approval.

## Source and capture evidence

`provenance.json` records the app revision, inventory and capture-bootstrap
hashes, native dimensions, capture requests and reviewed image hashes.
`media-credits.json` records source-frame and prepared-artwork hashes.
The bootstrap configures an owned loopback fixture through the normal media
provider path. It does not recreate or repaint the app and is not shipped.

The fixture contains synthetic watch progress within genuine edition runtimes.
Home has multiple Continue Watching entries; library browsing uses the normal
Date Added sort option. The iPad Home capture retains its native portrait
orientation. Playback uses actual licensed film video, not a rendered still.

Use owned simulators without personal accounts, Keychain data or libraries.
Disable external metadata and review all visible art, including related-title
rows and actor portraits. A detail screen that imports unreviewed related art
must not be published. A missing title, spinner, error or timed-out request is
not a usable screenshot. Do not conceal an unapproved asset by retouching it.

The current Netflix Open Content master-frame sources use their project-root
CC BY 4.0 licenses. The legacy Meridian Techblog sample with its different
license is not part of this set. Sita imagery is extracted from the CC0 film,
not the separately licensed still collection; no soundtrack is used. Tears of
Steel artwork uses environment imagery without identifiable actor portraits.
Historical-film status is not permission to use an unrelated modern poster,
restoration or score.

Native captures may be normalized to opaque 8-bit sRGB. Do not resize masters,
stretch the interface or replace controls. Proportionate responsive encodes
are generated separately. Stop owned fixtures and simulators after capture.
Do not disturb build caches or resources owned by other sessions.

## Review and import

Review is a documented human/agent decision, not an automatic license detector.
Unknown origins, missing evidence and incompatible reuse terms require rejection.

```sh
node tools/sync-shots.mjs --from /absolute/path/to/reviewed-captures --dry-run
node tools/sync-shots.mjs --from /absolute/path/to/reviewed-captures
npm run check:images
npm run test:site
```

The source directory must contain `provenance.json`, `capture-bootstrap.patch`,
`media-credits.json` and exactly the listed PNGs. Schema 2 requires reviewed
source credits, artwork hashes and a credited media reference for every image.
Schema 1 remains supported for the older original procedural-media workflow;
its generator and `demo-media.json` hashes are still required.

A changed image set requires an explicit usage/layout update, including
`tools/build-images.mjs`, before import. Ordinary builds verify every master and
derivative hash; unknown, changed or leftover published images fail validation.
Each AVIF/WebP filename includes a content-and-recipe hash, giving replacement
captures fresh cache keys. Full regeneration removes obsolete derivatives,
not third-party caches or Git history.
