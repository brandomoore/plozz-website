// The homepage renders both the visible answers and FAQPage data from this list.
import { DISCORD_URL, GITHUB_URL, TESTFLIGHT_URL } from './site';

export interface Faq {
  q: string;
  /** May contain HTML (rendered with set:html in the visible list). */
  a: string;
}

export const faqs: Faq[] = [
  {
    q: 'Is Plozz really free?',
    a: 'Yes. Plozz is free software, licensed under the GPL-3.0 and open source — no subscriptions, no ads, no upsells. If it\u2019s useful to you, sponsorship is welcome but never required.',
  },
  {
    q: 'Is Plozz a free alternative to Infuse on Apple TV?',
    a: 'Yes. Plozz is a completely free, open-source player for Apple TV, iPhone and iPad, with no subscription or paid feature tier. Connect your supported media server or network share. <a href="/infuse-alternative">See Plozz as an Infuse alternative</a>, including connection options and limitations.',
  },
  {
    q: 'How does Plozz compare with other Apple TV media apps?',
    a: 'Plozz combines supported servers and network shares in a completely free, open-source player. Infuse, VLC, Plex, Emby and Swiftfin each suit different setups; VLC and Swiftfin are also free and open source. <a href="/apple-tv-media-players">Compare the players</a> by library, workflow and what to check before switching.',
  },
  {
    q: 'Can I hear TrueHD Atmos and DTS:X height channels on Apple TV?',
    a: 'Yes. Plozz uses AetherEngine to render height audio from supported Dolby TrueHD Atmos and DTS:X tracks on tvOS 26 or later with compatible Atmos equipment. It uses Apple Positional Audio and Dolby MAT, not untouched bitstream passthrough. <a href="/formats#height-channels">See requirements and the audio-quality tradeoff.</a>',
  },
  {
    q: 'Do I need a media server?',
    a: 'Use a Jellyfin, Plex, Emby or Silo server you have access to, or connect directly to SMB, NFS, WebDAV, SFTP or FTP storage. You can also bring your own IPTV playlist without a media-server account. Plozz doesn\u2019t provide films, shows or public channels.',
  },
  {
    q: 'Does Plozz collect my data or track me?',
    a: 'There\u2019s no Plozz account or usage analytics. Server credentials stay in the device Keychain; iCloud sync carries non-secret setup and preferences. Approved device-to-device setup can transfer eligible logins, but Silo always needs separate approval on the receiving device. Connected metadata services and trackers receive the requests needed for their features. <a href="/privacy">Read the privacy policy.</a>',
  },
  {
    q: 'How do I install it?',
    a: `Use the <a href="${TESTFLIGHT_URL}" target="_blank" rel="noopener">public TestFlight invitation</a> for Apple TV, iPhone and iPad. The build available to you depends on Apple\u2019s beta review and TestFlight availability.`,
  },
  {
    q: 'What\u2019s different on each device?',
    a: 'All three have native playback, libraries, profiles and in-player version selection. iPhone and iPad add offline downloads, movie/episode streaming-quality controls, Picture in Picture and AirPlay. Apple TV has remote-focused navigation and Top Shelf. There are no offline downloads or mobile-style streaming-quality controls on Apple TV.',
  },
  {
    q: 'Does Silo need its Jellyfin compatibility mode?',
    a: 'No. Plozz connects to Silo\u2019s native v2 API. Approve the device in Silo, then choose the server profile. Its library restrictions, PIN protection and watch history remain server-owned. <a href="/silo">Silo support and limitations.</a>',
  },
  {
    q: 'Can I reduce streaming data use?',
    a: 'On iPhone and iPad, set movie and episode quality for your local network, remote Wi-Fi/Ethernet and cellular connections. Choose a preset or independent resolution and total-bitrate limits. Originals play when they fit; otherwise the server must support conversion. These controls don\u2019t change music, Live TV, downloads or network-share playback. <a href="/features#can-i-use-less-data">Quality details.</a>',
  },
  {
    q: 'Can I change versions without leaving the player?',
    a: 'Yes, on Apple TV, iPhone and iPad. Pick another file or edition on the active server/account while keeping your position, pause state, speed, quality and matching tracks. Different cuts can have different timelines. This is version switching, not in-player server switching.',
  },
  {
    q: 'Are Plozz profiles the same as server users?',
    a: 'No. Plozz profiles keep presentation, library choices and preferences separate. Connected server users or profiles still own their permissions and watch history. A Plozz household profile doesn\u2019t create or replace a Plex or Silo identity.',
  },
  {
    q: 'Is every server feature available without a subscription?',
    a: 'Plozz has no paid tier, but it can\u2019t remove a server\u2019s requirements. Transcoding, downloads and other server-backed features depend on its capabilities, configuration and permissions. Plex Common Sense Media topic guidance requires an eligible active Plex user with Plex Pass access; it isn\u2019t available across all providers.',
  },
  {
    q: 'Is there a Plozz community?',
    a: `Join the <a href="${DISCORD_URL}" target="_blank" rel="noopener">Plozz Discord</a> to chat with other users and discuss the app.`,
  },
  {
    q: 'I found a bug or want a feature.',
    a: `Open an issue on <a href="${GITHUB_URL}/issues" target="_blank" rel="noopener">GitHub</a> \u2014 that\u2019s the best place to report bugs and request features.`,
  },
];

/** Strip HTML tags for plain-text contexts (e.g. JSON-LD answers). */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}
