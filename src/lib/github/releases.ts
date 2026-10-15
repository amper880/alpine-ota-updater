/**
 * Loads release lists from the GitHub API. The last good list is kept in IndexedDB: it is
 * reused for 10 minutes (the unauthenticated API allows 60 requests per hour) and shown when
 * offline.
 */
import type { Release } from '../catalog/types.ts';
import { getCachedReleases, putCachedReleases } from '../cache/db.ts';
import { httpFetch } from '../net/http.ts';

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

export function fromGitHub(data: GhRelease[]): Release[] {
  return data.map((r) => ({
    tag: r.tag_name,
    name: r.name ?? r.tag_name,
    publishedAt: r.published_at ?? '',
    prerelease: r.prerelease,
    draft: r.draft,
    body: (r.body ?? '').slice(0, 20000),
    htmlUrl: r.html_url,
    assets: r.assets.map((a) => ({ name: a.name, size: a.size, digest: a.digest ?? null })),
  }));
}

export interface ReleaseResult {
  releases: Release[];
  /** Set when the list comes from the offline copy. */
  offlineSince?: string;
}

const FRESH_MS = 10 * 60 * 1000;

export async function loadReleases(repo: string, opts: { signal?: AbortSignal; force?: boolean } = {}): Promise<ReleaseResult> {
  const cached = await getCachedReleases(repo).catch(() => undefined);
  if (cached && !opts.force && Date.now() - Date.parse(cached.fetchedAt) < FRESH_MS) return { releases: cached.releases };
  try {
    const res = await httpFetch(`https://api.github.com/repos/${repo}/releases?per_page=40`, {
      signal: opts.signal,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!res.ok) throw new Error(`GitHub API: HTTP ${res.status}`);
    const releases = fromGitHub((await res.json()) as GhRelease[]);
    void putCachedReleases(repo, releases).catch(() => undefined);
    return { releases };
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    if (cached) return { releases: cached.releases, offlineSince: cached.fetchedAt };
    throw err;
  }
}
