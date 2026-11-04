# Product

## Register

brand

## Users

People evaluating Plozz as a native media and IPTV player for Apple TV, iPhone, and iPad. They may use Jellyfin, Plex, Emby, Silo, direct network storage, or their own IPTV accounts and playlists.

## Product Purpose

Explain what Plozz supports, establish trust in the open-source project, and help visitors download Plozz Player from the App Store or view its source on GitHub. TestFlight is a secondary option for trying upcoming changes.

## Brand Personality

Dark, precise, and slightly dry. Plozz is a media player for people who care about
settings, so the site should sound like it was written by the person who built it.
The Plozz logo keeps its pixel-art identity; everything else is modern Apple-like
interface chrome.

## Anti-references

Gradient-heavy SaaS pages, dense marketing-section stacks, excessive accent colors, glassmorphism, generic card grids, and navigation or copy that distracts from the primary actions.

## Design Principles

- Give each viewport one dominant idea.
- Keep the home hero to its headline, provider marks and primary actions. Put
  platform descriptions, comparison pitches and audio details in feature/FAQ
  content or their dedicated pages, not supporting paragraphs under the headline.
- Use rich black, white, and neutral gray as the foundation.
- Reserve color for authentic brand artwork, the Plozz logo light, and primary actions.
- Keep pixel art in the Plozz artwork; use modern Apple-like interface chrome everywhere else.
- Distinguish media-server support from direct network-share support.
- Use authentic provider assets without altering their artwork.
- Make every visible word earn its place; prefer short labels over explanatory copy.
- Vary section treatment by importance instead of repeating the same container pattern.
- Round every surface. The radius scale is --r-xl / --r-lg / --r-md / --r-sm / --r-pill.
- Demonstrate a setting, do not list it. A page of option names is raw data, not
  design. Lead with the question a person arrives with, answer it in one line,
  then show the thing working.
- Real option names belong inside a demo, not in a table of their own.
- A grid of identical chips is a data dump wearing rounded corners. On the home
  page, show a short row of two-tone badges (the shape used in the Plozz README)
  and send anyone who wants the full list to /formats.
- Reference material belongs on its own page. A list nobody reads in a marketing
  section is a page that ranks on its own.
- Subtext must change the answer. If a line only restates the heading, cut it.
- One keyline. Text inside a panel sits on the same vertical line as text
  outside one, so panels pull outward by their own inset plus their border
  rather than sitting inside the text column. --panel-inset owns both numbers,
  and no panel should ever set padding-inline directly.
- Interactive things need a 44px tap target. Give it with padding and pull the
  box back with a negative margin, so the visible mark stays on the column.
- The Plozz mark's antennas carry almost no visual weight, so its solid body
  reads about 2px below the box centre. Lift the image, not the text.
- Follow the natural-writing rules: no promotional verbs, no rule of three, no false
  ranges, sparing em dashes, sentence case headings.
- Use contractions. Copy without them reads like a machine wrote it.
- Vary sentence length. Never three of the same length in a row, and let a short
  one land after a long one.
- Use concise format labels rather than explaining every technical term in
  marketing copy.
- The donate section speaks as Brandon, in first person, because a person is
  doing the asking. Everywhere else addresses the reader as you.
- Never justify the donation ask. Listing what the money pays for reads as an
  invoice, so stay vague about costs, keep the ask conditional, and always say
  the app is free either way. Brandon's own GitHub Sponsors wording is the
  reference for tone: warm, humble, and easy to walk past.

## Privacy copy

Explain what leaves the device, why, who receives it and what the user controls.
Keep implementation details in the public source and technical guides, not the
policy. Describe current behavior rather than historical beta differences.
Preserve material disclosures about optional diagnostics,
public support posts, credential sync and short-lived account-linking data.
Distinguish inspectable source code from private user data, and Plozz's own
diagnostic use from independently operated services the user connects.

## Alternative-app searches

Use natural, factual mentions of other Apple TV media apps when they help a
visitor choose. The `/infuse-alternative` page owns the "free, open-source
Infuse alternative" positioning; link to it from relevant copy instead of
creating near-duplicate pages for every competitor or repeating names everywhere.
`/apple-tv-media-players` provides the broader app-by-app comparisons, with
Infuse first and a link to its focused page. Give each app a fair use case,
a specific reason to try Plozz and a switching caveat. Link official sources
and date the comparison; do not call an app the most popular without evidence.
Keep Plozz as the product, distinguish clients from servers, and acknowledge
that VLC and Swiftfin are also free and open source. Never imply affiliation, universal
feature parity, automatic migration or guaranteed search rankings.

### Never name a competitor's price

Say what Plozz does and that it is free. Do not name another app's paid tier,
do not frame a feature as "they charge for this", and do not run a comparison
table. Price and paywall comparisons go stale; explain Plozz's own features
and limitations instead. Mentioning an alternative is not a claim that the
other app lacks those features.

## Claims we must not make

- "Never transcodes." Mobile movie/episode quality limits can request server
  conversion. Originals play when they fit; capabilities and entitlements apply.
- "The same features on every platform/provider." Offline downloads and
  streaming-quality controls are iPhone/iPad features. Quality controls do not
  apply to Apple TV, music, Live TV, downloads or network shares.
- "Silo uses Jellyfin compatibility." It uses the native v2 API. Current native
  conversion supports 480p, 720p, 1080p and 2160p with H.264, not 240p, 1440p or
  HEVC conversion. Original HEVC playback is a separate capability.
- "Switch servers in the player." File/version/edition changes stay on the
  active server/account. Position carries over, not frame-exact scene matching
  across different cuts.
- "Every login follows through iCloud." Profiles and setup sync; eligible
  sign-ins can also transfer through iCloud Keychain on iPhone/iPad or approved
  device setup. Apple TV does not use that Keychain path. Silo always pairs anew.
- "Common Sense Media on every provider." It is Plex-only; detailed topics need
  eligible active-user/Plex Pass access. Ages are separate from review scores.
- "Ratings with no API key." AniList scores are keyless; optional OMDb
  enrichment needs the user's own key.
- Dolby Vision, height-channel rendering, TrueHD Atmos, DTS:X, Apple Positional Audio or
  Dolby MAT are outside the website's editorial scope. Do not mention these
  features, their settings or their availability in public copy or metadata,
  even if app or engine source still describes them. Do not add a notice about
  this scope decision. Ordinary channel-based audio and E-AC-3 JOC are separate.
- "Professionally localized." The 36 languages ship, but they are machine
  translated and machine reviewed, and every string is tagged needs_review.
- Sign-in flows as a selling point. Quick Connect, Plex Link and discovery are
  real, but people set them up once and never think about them again. Lead with
  what someone touches every session.
- "A format badge proves HDMI output." Current-stream facts, original metadata
  and selected quality limits are distinct. HDR conversions may fail or change
  HDR/audio, and throughput is not stream bitrate.
- "The latest build is available to all testers." Keep the public invitation;
  external availability depends on Apple's beta review.

## Verified against source

Refreshed against brandomoore/Plozz commit
3aeb310846905d4e1fcb4641a5365d3d2b3d2156, release/041
(2026.9.23, build 41): `App/Resources/ReleaseNotes.json`,
`Sources/ProviderSilo/README.md` and `Sources/FeaturePlayback/README.md`,
plus the maintained app README and `docs/live-tv-prototype.md` (the production
Live TV documentation despite its historical filename).

Music, Trakt, AniList, MyAnimeList, Simkl and Last.fm are current features for
their supported media types. Preserve network-share matching and sidecars,
watchlists, Seerr season requests, collections/extras, Live TV where supported,
profile-scoped presentation, dual subtitles, themes/layout and circadian mode.
Plozz profiles do not replace server users or their restrictions/history.
Music libraries use Plex/Jellyfin/Emby, not Silo or shares. Live TV supports
user-supplied M3U playlists, Xtream accounts, XMLTV guides, authorized
Plex/Jellyfin/Emby channels and scheduled library channels. It supplies no public
channels or channel subscription. Source setup carries an Experimental note on
both TV and mobile; navigation is simply Live TV.

IPTV / Live TV is a first-class supported source: include it in navigation,
the hero's source list and social artwork, not in extra hero paragraphs.
`/live-tv` owns the details. Current capabilities were checked against
[`docs/live-tv-prototype.md` at e95ccd6](https://github.com/brandomoore/Plozz/blob/e95ccd6c907cfbac64b3c3ee8aca902a266c7428/docs/live-tv-prototype.md)
on October 17, 2026: up to four-channel Multiview, guide/search, favorites,
recents, Home channel shortcuts and generated library channels. Catch-up and
recording management are not supported. Imported M3U files and saved Multiview
compositions stay device-local. Provider limits and permissions still apply.

## Accessibility & Inclusion

Maintain WCAG AA contrast for body text and controls, semantic structure and image alternatives, visible keyboard focus, and reduced-motion behavior.

## Screenshot media

Publish real Plozz captures only. Every visible film frame, poster, backdrop,
avatar, description and subtitle must have recorded reuse permission. A free
app, a purchased film or metadata-provider access is not permission to reproduce
someone else's promotional art. Use a varied selection of real films and authentic
artwork with documented public-domain status or a license permitting the intended
promotional use and cropping. Prefer beautiful, readable imagery over filling a
quota. Match each backdrop to its film and use full-bleed covers, not black-padded
scans. Procedural fixtures may remain useful for testing but are not the marketing
baseline. Keep online artwork/metadata disabled for captures.
Do not retouch a screenshot to disguise its media, labels or app behavior.
Keep source and capture hashes with the approved screenshot inventory. New or
changed screenshots must fail publication until their provenance is recorded.
Rights records reduce uncertainty; they do not guarantee legal clearance or
App Store approval.
