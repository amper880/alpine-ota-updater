/**
 * Pure helpers for the "new app version available" check: version comparison and picking the
 * installer that fits the running platform from a GitHub release.
 */

/** "v0.5.0-beta" / "0.5.0" → [0, 5, 0]; undefined when there is no numeric version. */
export function parseVersion(v: string): number[] | undefined {
  const m = /^v?(\d+(?:\.\d+)*)/.exec(v.trim());
  return m ? m[1].split('.').map(Number) : undefined;
}

/** True when `latest` is a higher version than `current` (labels such as "-beta" are ignored). */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export type AppPlatform = 'windows' | 'macos' | 'linux' | 'android' | 'other';

export function detectPlatform(userAgent: string): AppPlatform {
  if (/android/i.test(userAgent)) return 'android';
  if (/windows/i.test(userAgent)) return 'windows';
  if (/macintosh|mac os x/i.test(userAgent)) return 'macos';
  if (/linux/i.test(userAgent)) return 'linux';
  return 'other';
}

const INSTALLER: Record<AppPlatform, RegExp | undefined> = {
  windows: /-setup\.exe$/i,
  macos: /\.dmg$/i,
  linux: /\.AppImage$/i,
  android: /\.apk$/i,
  other: undefined,
};

/** Download URL of the installer for this platform, if the release has one. */
export function pickInstaller(assets: { name: string; url: string }[], platform: AppPlatform): string | undefined {
  const re = INSTALLER[platform];
  return re ? assets.find((a) => re.test(a.name))?.url : undefined;
}
