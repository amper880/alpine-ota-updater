/**
 * Checks once at start-up whether a newer Alpine OTA Updater release exists on GitHub and, if
 * so, offers it (banner in main.ts). Failures are silent: no network is a normal state for
 * this app (e.g. while on a node's WiFi).
 */
import { APP_VERSION, REPO_URL } from '../lib/config.ts';
import { httpFetch } from '../lib/net/http.ts';
import { isNativeApp } from '../lib/platform.ts';
import { loadPref, savePref } from '../lib/util/storage.ts';
import { detectPlatform, isNewer, pickInstaller } from '../lib/update/version.ts';
import { store } from './state.ts';

export interface AppUpdate {
  version: string;
  /** Installer for this platform, or the release page when there is none. */
  downloadUrl: string;
  releaseUrl: string;
}

interface GhLatest {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: { name: string; browser_download_url: string }[];
}

export async function checkForAppUpdate(): Promise<void> {
  if (!isNativeApp()) return;
  const repo = /github\.com\/([^/]+\/[^/]+)/.exec(REPO_URL)?.[1];
  if (!repo) return;
  try {
    // "latest" skips drafts and pre-releases.
    const res = await httpFetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!res.ok) return;
    const rel = (await res.json()) as GhLatest;
    if (!isNewer(rel.tag_name, APP_VERSION)) return;
    const version = rel.tag_name.replace(/^v/, '');
    if (loadPref<string>('dismissedUpdate', '') === version) return;
    const assets = rel.assets.map((a) => ({ name: a.name, url: a.browser_download_url }));
    const installer = pickInstaller(assets, detectPlatform(navigator.userAgent));
    store.set({ appUpdate: { version, downloadUrl: installer ?? rel.html_url, releaseUrl: rel.html_url } });
  } catch {
    // offline or GitHub unreachable: try again at the next start
  }
}

/** "Later": hides the banner until an even newer version appears. */
export function dismissAppUpdate(): void {
  const u = store.get().appUpdate;
  if (u) savePref('dismissedUpdate', u.version);
  store.set({ appUpdate: undefined });
}
