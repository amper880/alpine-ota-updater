/**
 * Alpine OTA Updater download proxy (Cloudflare Worker).
 *
 * Browsers cannot download GitHub release assets directly because the asset hosts do not send
 * CORS headers. This worker fetches them on the app's behalf, but only for an explicit
 * allow-list of repositories, so it cannot be abused as an open proxy.
 *
 * Routes:
 *   GET /releases?repo=<owner/name>                    trimmed release list (cached 10 min)
 *   GET /asset?repo=<owner/name>&tag=<tag>&name=<file> streams one release asset
 *   GET /health                                        "ok"
 *
 * Environment (wrangler.toml [vars] / secrets):
 *   ALLOWED_REPOS    comma-separated "owner/name" list (case-insensitive)
 *   ALLOWED_ORIGINS  comma-separated origins, or "*"
 *   GITHUB_TOKEN     optional secret; raises the GitHub API rate limit
 */

export interface Env {
  ALLOWED_REPOS: string;
  ALLOWED_ORIGINS: string;
  GITHUB_TOKEN?: string;
}

/** Subset of the Cache API the worker uses (Cloudflare `caches.default`). */
interface EdgeCache {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
}

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const RELEASES_TTL = 600;
const SAFE = /^[\w.+\-]+$/;
const UA = 'alpine-ota-updater-proxy';

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = list(env.ALLOWED_ORIGINS);
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed.includes('*')) h['Access-Control-Allow-Origin'] = '*';
  else if (origin && allowed.includes(origin.toLowerCase())) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body: unknown, status: number, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

interface GhAsset {
  name: string;
  size: number;
  digest?: string | null;
}
interface GhRelease {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
  body: string | null;
  html_url: string;
  assets: GhAsset[];
}

/** Request handler; also used by the local dev server (scripts/dev.mjs). */
export async function handle(request: Request, env: Env, cache?: EdgeCache, ctx?: Ctx): Promise<Response> {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, cors);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '').replace(/^.*\/(releases|asset|health)$/, '/$1');
  if (path === '/health') return new Response('ok', { headers: cors });

  const repo = (url.searchParams.get('repo') ?? '').trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !list(env.ALLOWED_REPOS).includes(repo.toLowerCase())) {
    return json({ error: 'repository not allowed' }, 403, cors);
  }

  const ghHeaders: Record<string, string> = { 'User-Agent': UA };
  if (env.GITHUB_TOKEN) ghHeaders.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

  if (path === '/releases') {
    const cacheKey = new Request(`https://cache.internal/releases/${repo.toLowerCase()}`);
    const hit = await cache?.match(cacheKey);
    if (hit) return withHeaders(hit, { ...cors, 'X-Cache': 'HIT' });

    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=40`, {
      headers: { ...ghHeaders, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!res.ok) return json({ error: `GitHub API responded ${res.status}` }, 502, cors);
    const data = (await res.json()) as GhRelease[];
    const trimmed = data.map((r) => ({
      tag: r.tag_name,
      name: r.name ?? r.tag_name,
      publishedAt: r.published_at ?? '',
      prerelease: r.prerelease,
      draft: r.draft,
      body: (r.body ?? '').slice(0, 20000),
      htmlUrl: r.html_url,
      assets: r.assets.map((a) => ({ name: a.name, size: a.size, digest: a.digest ?? null })),
    }));
    const out = json(trimmed, 200, { 'Cache-Control': `public, max-age=${RELEASES_TTL}` });
    if (cache) {
      const p = cache.put(cacheKey, out.clone());
      if (ctx) ctx.waitUntil(p);
      else await p;
    }
    return withHeaders(out, { ...cors, 'X-Cache': 'MISS' });
  }

  if (path === '/asset') {
    const tag = url.searchParams.get('tag') ?? '';
    const name = url.searchParams.get('name') ?? '';
    if (!SAFE.test(tag) || !SAFE.test(name)) return json({ error: 'invalid tag or file name' }, 400, cors);
    const upstream = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
    const res = await fetch(upstream, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!res.ok || !res.body) return json({ error: `asset download failed (${res.status})` }, 502, cors);
    const headers: Record<string, string> = {
      ...cors,
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400, immutable',
    };
    const len = res.headers.get('Content-Length');
    if (len) headers['Content-Length'] = len;
    return new Response(res.body, { status: 200, headers });
  }

  return json({ error: 'not found' }, 404, cors);
}

function withHeaders(res: Response, extra: Record<string, string>): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const cache = (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches?.default;
    return handle(request, env, cache, ctx);
  },
};
