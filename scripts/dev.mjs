#!/usr/bin/env node
/**
 * Front-end dev server for `tauri dev` (http://localhost:5173), rebuilding on change.
 * It can also be opened in a normal browser to work on the UI; Bluetooth and downloads then
 * show as unavailable because they need the native app.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, watch } from 'node:fs';
import { extname, join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 5173);
const outdir = join(root, '.dev');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

async function rebuild() {
  try {
    await build({ dev: true, outdir });
    console.log(`[dev] built ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error('[dev] build failed:', err.message);
  }
}

await rebuild();
let timer;
for (const dir of ['src', 'public', 'catalog']) {
  watch(join(root, dir), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 80);
  });
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  let file = normalize(join(outdir, decodeURIComponent(url.pathname)));
  if (!file.startsWith(outdir)) return void res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(outdir, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`[dev] http://localhost:${port}`));
