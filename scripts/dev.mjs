#!/usr/bin/env node
/**
 * Local development server.
 *
 *   npm run dev       rebuilds on change, serves http://localhost:5173
 *   npm run preview   serves the production build from dist/
 *
 * The download proxy runs in-process at /proxy (same code as the Cloudflare Worker), so no
 * Cloudflare account is needed for development. `localhost` counts as a secure context, so
 * Web Bluetooth works here too.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, watch } from 'node:fs';
import { extname, join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { handle } from '../proxy/src/worker.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const preview = process.argv.includes('--preview');
const port = Number(process.env.PORT ?? 5173);
const outdir = preview ? join(root, 'dist') : join(root, '.dev');

const wrangler = readFileSync(join(root, 'proxy', 'wrangler.toml'), 'utf8');
const env = {
  ALLOWED_REPOS: wrangler.match(/ALLOWED_REPOS\s*=\s*"([^"]*)"/)?.[1] ?? '',
  ALLOWED_ORIGINS: '*',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

async function rebuild() {
  try {
    await build({ dev: !preview, outdir, proxyUrl: '/proxy' });
    console.log(`[dev] built ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error('[dev] build failed:', err.message);
  }
}

if (!preview) {
  await rebuild();
  let timer;
  for (const dir of ['src', 'public', 'catalog']) {
    watch(join(root, dir), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 80);
    });
  }
} else if (!existsSync(outdir)) {
  console.error('dist/ not found — run `npm run build` first (it uses ALPINE_PROXY_URL; preview overrides it with /proxy).');
  await build({ outdir, proxyUrl: '/proxy' });
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname.startsWith('/proxy/')) {
    const r = await handle(new Request(url, { headers: { Origin: `http://${req.headers.host}` } }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    if (r.body) for await (const chunk of r.body) res.write(chunk);
    res.end();
    return;
  }
  let file = normalize(join(outdir, decodeURIComponent(url.pathname)));
  if (!file.startsWith(outdir)) return void res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(outdir, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`[dev] http://localhost:${port}${preview ? ' (preview)' : ''}`));
