export const GITHUB_URL = 'https://github.com/brandomoore/Plozz';
export const DONATE_URL = 'https://github.com/sponsors/brandomoore';
export const DISCORD_URL = 'https://discord.gg/YkXnmB8rcF';
export const TESTFLIGHT_URL = 'https://testflight.apple.com/join/EKfReNMu';
export const SITE = 'https://plozz.app';
export const GITHUB_STARS_SEED = 26;

export const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/formats', label: 'Formats' },
  { href: '/network-shares', label: 'Network shares' },
];

export const SERVER_LINKS = [
  { href: '/jellyfin', label: 'Jellyfin' },
  { href: '/plex', label: 'Plex' },
  { href: '/emby', label: 'Emby' },
  { href: '/silo', label: 'Silo' },
];

/**
 * Read from AetherEngine's format matrix and its documented limitations.
 * https://github.com/superuser404notfound/AetherEngine/blob/main/docs/formats.md
 * Nothing here is claimed beyond what those docs support.
 */
export const HEADLINE_BADGES = [
  { label: 'Dolby Vision', value: 'P5 · P7 · P8.1 · P8.4' },
  { label: 'HDR', value: 'HDR10 · HDR10+ · HLG' },
  { label: 'Height audio', value: 'TrueHD Atmos · DTS:X' },
  { label: 'Video', value: 'HEVC · H.264 · AV1 · VP9' },
  { label: 'Lossless audio', value: 'TrueHD · DTS-HD MA' },
  { label: 'Discs', value: 'DVD · Blu-ray ISO' },
];

export const FORMAT_TABLE = [
  {
    group: 'Video',
    rows: [
      { name: 'HEVC / H.265', note: 'Main and Main10, hardware decoded' },
      { name: 'H.264 / AVC', note: 'Including interlaced and High 4:2:2, 4:4:4 and 10-bit' },
      { name: 'AV1', note: 'Hardware where the chip has it, software everywhere else' },
      { name: 'VP9 and VP8', note: '' },
      { name: 'MPEG-2', note: 'DVD rips and broadcast recordings' },
      { name: 'MPEG-4 Part 2', note: 'XVID and DIVX' },
      { name: 'VC-1', note: '' },
    ],
  },
  {
    group: 'High dynamic range',
    rows: [
      { name: 'Dolby Vision Profile 5', note: '' },
      { name: 'Dolby Vision Profile 7', note: 'Converted to Profile 8.1 during playback, which Apple hardware cannot do alone' },
      { name: 'Dolby Vision Profile 8.1 and 8.4', note: '' },
      { name: 'Dolby Vision on AV1', note: 'Profiles 10.1 and 10.4' },
      { name: 'HDR10', note: '' },
      { name: 'HDR10+', note: 'Per-frame ST 2094-40 metadata passed through' },
      { name: 'HLG', note: '' },
    ],
  },
  {
    group: 'Audio',
    rows: [
      { name: 'Dolby TrueHD Atmos', note: 'Height-channel rendering through AetherEngine on supported Apple TV setups, using Apple Positional Audio and Dolby MAT' },
      { name: 'DTS:X', note: 'Supported DTS-HD MA presentations retain height audio through the same rendering path, not native DTS:X bitstream output' },
      { name: 'Dolby Digital Plus Atmos', note: 'E-AC-3 with JOC, copied without re-encoding on compatible playback paths' },
      { name: 'Dolby TrueHD and MLP', note: 'Channel-based playback to surround or lossless FLAC; separate from the lossy height-audio path' },
      { name: 'DTS, DTS-HD MA', note: 'Channel-based playback to surround or lossless FLAC; DTS:X rendering requires a supported extension' },
      { name: 'E-AC-3 and AC-3', note: 'Copied without re-encoding' },
      { name: 'FLAC and ALAC', note: 'Copied without re-encoding' },
      { name: 'AAC, HE-AAC, HE-AACv2', note: '' },
      { name: 'MP3, MP2, Opus, Vorbis, PCM', note: '' },
      { name: '5.1 and 7.1', note: 'Channel layout preserved' },
    ],
  },
  {
    group: 'Subtitles',
    rows: [
      { name: 'SRT, ASS, SSA, WebVTT', note: 'Styling and positioning honoured' },
      { name: 'PGS', note: 'Blu-ray image subtitles, rendered on device' },
      { name: 'DVB and DVD', note: 'Image subtitles' },
      { name: 'CEA-608', note: 'Broadcast closed captions, including captions buried in the video stream' },
      { name: 'DVB teletext', note: 'Broadcaster colours preserved' },
      { name: 'Sidecar files', note: 'Picked up from the same folder or a Subs folder beside it' },
    ],
  },
  {
    group: 'Containers and sources',
    rows: [
      { name: 'MKV', note: '' },
      { name: 'MP4 and MOV', note: '' },
      { name: 'WebM, AVI, OGG, FLV', note: '' },
      { name: 'MPEG-TS', note: 'Including live broadcast' },
      { name: 'DVD and Blu-ray images', note: 'Decrypted ISO, with titles and chapters' },
    ],
  },
];

/** Stated plainly, because a support list nobody can trust is worth nothing. */
export const FORMAT_CAVEATS = [
  {
    name: 'Output depends on the whole playback chain',
    note: 'The file, device, display and audio equipment all matter. Format badges describe media, not proof of HDMI output. A server conversion can change HDR, codecs and audio.',
  },
  {
    name: 'Quality limits can ask your server to transcode',
    note: 'On iPhone and iPad, movie and episode quality controls keep the original when it fits and request conversion when needed. Server capabilities, settings and entitlements still apply.',
  },
  {
    name: 'Height rendering is not bitstream passthrough',
    note: 'AetherEngine renders supported TrueHD Atmos and DTS:X audio into a speaker layout, then encodes Apple Positional Audio (APAC). APAC is lossy; tvOS delivers it as Dolby MAT, not the original TrueHD or DTS:X bitstream.',
  },
  {
    name: 'Height audio needs a supported playback path',
    note: 'Requires tvOS 26 or later, a supported 48 kHz source, the object-audio rendering path and a compatible Atmos receiver or soundbar setup. Unsupported sources or playback paths can fall back to channel-based audio without heights. A server conversion can remove the source information needed for rendering.',
  },
  {
    name: 'AV1 is software decoded on Apple TV',
    note: 'No Apple TV chip has AV1 in hardware yet. It plays, but it works the processor harder than HEVC does.',
  },
  {
    name: 'Dolby Vision Profile 7 becomes Profile 8.1',
    note: 'The enhancement layer is dropped, which no Apple device could decode anyway. You get Dolby Vision instead of the HDR10 fallback.',
  },
];

export const INCLUDED = [
  { name: 'TrueHD Atmos and DTS:X', icon: 'ph:waveform', detail: 'Height channels on supported Apple TV setups, rendered through AetherEngine. No paid audio tier.' },
  { name: 'Lossless surround', icon: 'ph:speaker-hifi', detail: 'TrueHD and DTS-HD MA channel playback, separate from the height-audio rendering path.' },
  { name: 'AirPlay', icon: 'ph:airplay', detail: 'Send video from iPhone or iPad to another screen.' },
  { name: 'Offline downloads', icon: 'ph:download-simple', detail: 'Save films and episodes on iPhone and iPad, including from Silo.' },
  { name: 'Subtitle search', icon: 'ph:subtitles', detail: 'Find and load subtitles in the player where your server supports it.' },
  { name: 'iCloud sync', icon: 'ph:cloud', detail: 'Profiles, preferences and server setup across your devices, without cloud-syncing server credentials.' },
];

// GitHub Sponsors prefills its checkout from these, so one tap is one donation.
export const DONATION_AMOUNTS = [3, 5, 10, 25];
