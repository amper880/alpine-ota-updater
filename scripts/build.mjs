#!/usr/bin/env node
/**
 * Front-end build: bundles the UI with esbuild into dist/, which Tauri packages into the app
 * (see src-tauri/tauri.conf.json → build.frontendDist).
 *
 * Environment variables:
 *   ALPINE_REPO_URL   Source repository URL shown in the footer (optional)
 */
import { build as esbuild } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

export async function build({ dev = false, outdir = join(root, 'dist') } = {}) {
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });

  const result = await esbuild({
    absWorkingDir: root,
    entryPoints: { app: 'src/main.ts', styles: 'src/styles/main.css' },
    bundle: true,
    format: 'esm',
    // WebView2 (Windows) and Android System WebView are evergreen Chromium.
    target: ['chrome110'],
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    outdir: join(outdir, 'assets'),
    entryNames: dev ? '[name]' : '[name]-[hash]',
    metafile: true,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
      __REPO_URL__: JSON.stringify(process.env.ALPINE_REPO_URL ?? ''),
      __DEV__: JSON.stringify(dev),
    },
    legalComments: 'none',
    logLevel: 'warning',
  });

  const outputs = Object.keys(result.metafile.outputs).map((p) => relative(outdir, join(root, p)).replaceAll('\\', '/'));
  const js = outputs.find((p) => /assets\/app(-[A-Z0-9]+)?\.js$/i.test(p));
  const css = outputs.find((p) => /\.css$/.test(p));

  cpSync(join(root, 'public'), outdir, { recursive: true, filter: (src) => !src.endsWith('index.html') });
  const html = readFileSync(join(root, 'public', 'index.html'), 'utf8').replace('__JS__', js).replace('__CSS__', css);
  writeFileSync(join(outdir, 'index.html'), html);
  return { outdir, js, css };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await build();
  console.log(`built front-end ${pkg.version} → ${relative(root, r.outdir)}`);
}
