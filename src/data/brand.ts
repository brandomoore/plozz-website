import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function versionedAsset(name: string): string {
  // Astro relocates modules during prerendering; npm scripts run at the repo root.
  const bytes = readFileSync(`public/${name}`);
  const revision = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return `/${name}?v=${revision}`;
}

export const LOGO_PATH = versionedAsset('logo.svg');
export const SOCIAL_IMAGE_PATH = versionedAsset('og-image.png');
export const SOCIAL_IMAGE_ALT =
  'Plozz. Free and open source. Plays practically everything. Apple TV, iPhone and iPad. Jellyfin, Plex, Emby, Silo and network shares.';
