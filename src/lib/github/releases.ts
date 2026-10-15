/**
 * Loads release lists, preferring the proxy (cached at the edge) and falling back to the
 * public GitHub API, which allows CORS for listing. The last good list is kept in IndexedDB so
 * it can be shown offline.
 */
import type { Release } from '../catalog/types.ts';
import { PROXY_URL } from '../config.ts';
import { getCachedReleases, putCachedReleases } from '../cache/db.ts';

interface GhRelease {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
  body: string | null;
  html_url: string;
  assets: { name: string; size: number; digest?: string | null }[];
}

function fromGitHub(data: GhRelease[]): Release[] {
  return data.map((r) => ({
    tag: r.tag_name,
    name: r.name ?? r.tag_name,
    publishedAt: r.published_at ?? '',
    prerelease: r.prerelease,
    draft: r.draft,
    body: r.body ?? '',
    htmlUrl: r.html_url,
    assets: r.assets.map((a) => ({ name: a.name, size: a.size, digest: a.digest ?? null })),
  }));
}

export interface ReleaseResult {
  releases: Release[];
  /** Set when the list comes from the offline copy. */
  offlineSince?: string;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function loadReleases(repo: string, signal?: AbortSignal): Promise<ReleaseResult> {
  try {
    let releases: Release[];
    if (PROXY_URL) {
      releases = (await fetchJson(`${PROXY_URL}/releases?repo=${encodeURIComponent(repo)}`, signal)) as Release[];
    } else {
      const data = await fetchJson(`https://api.github.com/repos/${repo}/releases?per_page=40`, signal);
      releases = fromGitHub(data as GhRelease[]);
    }
    void putCachedReleases(repo, releases).catch(() => undefined);
    return { releases };
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    const cached = await getCachedReleases(repo).catch(() => undefined);
    if (cached) return { releases: cached.releases, offlineSince: cached.fetchedAt };
    throw err;
  }
}
