#!/usr/bin/env node
/**
 * Production build: bundles the app with esbuild into dist/ (static files, deployable to any
 * web server or GitHub Pages).
 *
 * Environment variables:
 *   ALPINE_PROXY_URL  URL of the download proxy (Cloudflare Worker), e.g.
 *                     https://alpine-ota-proxy.<account>.workers.dev
 *   ALPINE_REPO_URL   Source repository URL shown in the footer (optional)
 */
import { build as esbuild } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export async function build({ dev = false, outdir = join(root, 'dist'), proxyUrl } = {}) {
  const proxy = (proxyUrl ?? process.env.ALPINE_PROXY_URL ?? '').replace(/\/+$/, '');
  const repoUrl = process.env.ALPINE_REPO_URL ?? '';
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });

  const define = {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __PROXY_URL__: JSON.stringify(proxy),
    __REPO_URL__: JSON.stringify(repoUrl),
    __DEV__: JSON.stringify(dev),
  };

  const result = await esbuild({
    absWorkingDir: root,
    entryPoints: { app: 'src/main.ts', styles: 'src/styles/main.css' },
    bundle: true,
    format: 'esm',
    target: ['chrome110', 'edge110', 'firefox115', 'safari16'],
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    outdir: join(outdir, 'assets'),
    entryNames: dev ? '[name]' : '[name]-[hash]',
    metafile: true,
    define,
    legalComments: 'none',
    logLevel: 'warning',
  });

  const outputs = Object.keys(result.metafile.outputs).map((p) => relative(outdir, join(root, p)).replaceAll('\\', '/'));
  const js = outputs.find((p) => /assets\/app(-[A-Z0-9]+)?\.js$/i.test(p));
  const css = outputs.find((p) => /\.css$/.test(p));

  // Static files.
  cpSync(join(root, 'public'), outdir, { recursive: true, filter: (src) => !src.endsWith('index.html') });

  // index.html with hashed asset names and a strict CSP.
  let html = readFileSync(join(root, 'public', 'index.html'), 'utf8');
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  const inlineHash = createHash('sha256').update(inline).digest('base64');
  const connect = ["'self'", 'https://api.github.com', 'http://192.168.4.1'];
  if (proxy && /^https?:\/\//.test(proxy)) connect.push(new URL(proxy).origin);
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'sha256-${inlineHash}'`,
    "style-src 'self'",
    "img-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "form-action 'self' http://192.168.4.1",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
  html = html.replace('__CSP__', csp).replace('__JS__', js).replace('__CSS__', css);
  writeFileSync(join(outdir, 'index.html'), html);

  // Service worker with the precache list (skipped in dev).
  if (!dev) {
    const files = walk(outdir)
      .map((p) => relative(outdir, p).replaceAll('\\', '/'))
      .filter((p) => !p.endsWith('.map'));
    const precache = ['./', ...files.map((f) => `./${f}`)];
    const version = createHash('sha256').update(files.join('|') + pkg.version).digest('hex').slice(0, 12);
    await esbuild({
      absWorkingDir: root,
      entryPoints: ['src/sw.ts'],
      bundle: true,
      format: 'iife',
      minify: true,
      outfile: join(outdir, 'sw.js'),
      define: { __PRECACHE__: JSON.stringify(precache), __SW_VERSION__: JSON.stringify(version) },
      logLevel: 'warning',
    });
  }

  writeFileSync(join(outdir, 'version.json'), JSON.stringify({ version: pkg.version, proxy: Boolean(proxy) }) + '\n');
  writeFileSync(join(outdir, '.nojekyll'), '');
  return { outdir, js, css, proxy };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await build();
  console.log(`built ${pkg.version} → ${relative(root, r.outdir)} (proxy: ${r.proxy || 'not configured'})`);
}
