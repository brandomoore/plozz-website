# Reviewed screenshot originals

These are real Plozz simulator framebuffer captures. The library contains only
original procedural demo films, posters, backdrops, descriptions and subtitles
created by `tools/build-demo-library.py`, with the bundled OFL-licensed Manrope
typeface on posters. They do not depict commercial movies,
TV series, performers, licensed poster art or third-party recordings.

The media generator and its original output are supplied under this repository's
[MIT license](../LICENSE). Plozz's own interface and logo remain subject to the
app project's license. No copyright, patent, trademark or App Store approval
guarantee is implied by these records.

## Source and capture evidence

`provenance.json` records the exact app revision, generator hash, media inventory
hash, native screenshot dimensions, capture requests and reviewed image hashes.
The capture-only bootstrap patch in `capture-bootstrap.patch` adds the loopback
demo catalog through Plozz's existing authenticated-source path, completes onboarding
and disables online metadata/artwork. It also fixes the internal capture router
to finish navigation before clearing its request, avoiding self-cancellation.
It does not recreate or repaint the UI.
It is not part of the shipped app.

Use a fresh, owned simulator without an Apple account or personal media library.
Do not use `tools/capture-shots.sh`'s historical movie lists or private NFS source.
Do not copy an existing simulator's account, Keychain, metadata cache or artwork.
Review every capture, including backgrounds, thumbnails, captions and badges.
Do not hide an unapproved asset by blurring or painting over the screenshot.

Native captures may have their fully opaque alpha channel removed and be
normalized to 8-bit sRGB. Do not resize the masters or composite app controls.
Responsive encodes are generated separately from these masters.

## Reproduce the demo library

```sh
python3 tools/build-demo-library.py --out /absolute/path/to/demo-media
python3 tools/serve-demo-catalog.py --root /absolute/path/to/demo-media --port 8879
```

The first command requires CairoSVG, Pillow, FontTools, ImageMagick and FFmpeg.
It uses the bundled font, no media downloads or image-generation service.
The second command supplies a
Jellyfin-protocol capture fixture on `127.0.0.1`, with original catalog data and
image/video bytes from that directory. This is not a real Jellyfin deployment
or evidence of provider interoperability. The Plozz interface is unmodified.
No public server or system share is configured.
Give both the server and each simulator an explicit owner and bounded lifetime.
Stop them after capture.

Build Plozz from the recorded revision with the capture-only bootstrap applied
in an isolated checkout, following the app repository's build-lease and signing
instructions. Launch with `PLOZZ_SHOTS_CATALOG=http://127.0.0.1:8879/`,
`PLOZZ_SHOTS_NFS_HOST=127.0.0.1`, `PLOZZ_SHOTS_NFS_EXPORT=/` and
`PLOZZ_SHOTS_HOLD_CONTROLS=1`. The historical NFS variable enables the existing
capture command channel; the bootstrap connects the loopback catalog, not NFS.

The tvOS library capture uses the ordinary Libraries navigation-order preference
with Browse first. The iPad capture retains its native portrait orientation; the
website's device frame matches it rather than cropping it into a landscape screen.

Send each recorded request through the app's existing `.plozz-shots-request`
channel in its Documents directory. Require a successful acknowledgement and a
fully loaded screen. Capture with `xcrun simctl io <owned-id> screenshot`.
Do not treat a missing title, loading frame, simulator error or timed-out
navigation as a successful capture.

## Approve and publish

Before replacing the approved set, inspect the real images and record their
provenance. This is a human/agent review decision, not an automatic license
detector. Unknown origins or unverified permission require rejection.

```sh
node tools/sync-shots.mjs --from /absolute/path/to/reviewed-captures --dry-run
node tools/sync-shots.mjs --from /absolute/path/to/reviewed-captures
npm run images
npm run check:images
npm run test:site
```

The source directory must include reviewed `provenance.json` and exactly its
listed PNGs. Ordinary website builds verify all master hashes and all encoded
derivative hashes. Unknown, changed or leftover images fail publication rather
than silently entering the site. A generator change also requires renewed review.

`tools/build-images.mjs` owns the width ladders. Each AVIF/WebP filename includes
a hash of its source bytes and encoding settings, so a new capture gets a new
cache key. Full regeneration removes obsolete derivatives from the deployed
asset directory. Existing third-party caches and Git history are not erased.
