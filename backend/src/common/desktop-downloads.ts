/**
 * Direct installer links for the Tavilo Time desktop app.
 *
 * The API Lambda has no NAT, so it cannot ask GitHub for the latest release.
 * Asset names are versioned (electron-builder `artifactName`, spaces → dots), so
 * the links are built from DESKTOP_DOWNLOAD_VERSION. The releases page link is
 * always included as the fallback for anything newer or older.
 */

export const DESKTOP_RELEASES_REPO = 'revcloud/alyson-td-releases';
export const DEFAULT_DESKTOP_VERSION = '1.0.249';

export interface DesktopDownloads {
  version: string;
  windows: string;
  macAppleSilicon: string;
  macIntel: string;
  releasesPage: string;
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;

/** Accepts `1.0.249` or `v1.0.249`; anything else falls back to the default. */
export function resolveDesktopVersion(raw?: string | null): string {
  const cleaned = String(raw ?? '').trim().replace(/^v/i, '');
  return VERSION_PATTERN.test(cleaned) ? cleaned : DEFAULT_DESKTOP_VERSION;
}

export function resolveDesktopDownloads(rawVersion?: string | null): DesktopDownloads {
  const version = resolveDesktopVersion(rawVersion);
  const base = `https://github.com/${DESKTOP_RELEASES_REPO}/releases/download/v${version}`;
  return {
    version,
    windows: `${base}/Alyson.PM.Setup.${version}.exe`,
    macAppleSilicon: `${base}/Alyson.PM-${version}-arm64.dmg`,
    macIntel: `${base}/Alyson.PM-${version}.dmg`,
    releasesPage: `https://github.com/${DESKTOP_RELEASES_REPO}/releases/latest`,
  };
}
