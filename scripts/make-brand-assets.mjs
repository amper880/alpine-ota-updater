#!/usr/bin/env node
/**
 * Renders the app icon sources and the Windows installer images from the SVG logo.
 * Outputs are committed, so this only needs to run when the logo changes:
 *
 *   npm i --no-save sharp && node scripts/make-brand-assets.mjs
 *
 * Outputs
 *   src-tauri/icons/source.png              desktop / legacy icon (rounded square)
 *   src-tauri/icons/android-foreground.png  adaptive icon foreground (safe zone respected)
 *   src-tauri/icons/android-background.png  adaptive icon background
 *   src-tauri/icons/android-monochrome.png  themed (monochrome) icon
 *   src-tauri/installer/*.bmp               NSIS header/sidebar, WiX banner/dialog
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const PINE = '#1e6b58';
const root = new URL('../', import.meta.url);
const path = (p) => new URL(p, root).pathname;
const markSvg = readFileSync(path('assets/brand/logo-mark.svg'), 'utf8');
const markInner = markSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

/** The mark placed in a square of `size` px, occupying `scale` of it, on an optional background. */
function markSquare(size, scale, background, rounded = false, mono = false) {
  const s = (size * scale) / 512;
  const off = (size - 512 * s) / 2;
  let inner = markInner;
  if (mono) inner = inner.replace(/fill="#[0-9a-f]+"/gi, 'fill="#ffffff"').replace(/stroke="#[0-9a-f]+"/gi, 'stroke="#ffffff"').replace(/opacity="[^"]*"/g, 'opacity="0"');
  const bg = background ? `<rect width="${size}" height="${size}" ${rounded ? `rx="${size * 0.22}"` : ''} fill="${background}"/>` : '';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${bg}<g transform="translate(${off} ${off}) scale(${s})">${inner}</g></svg>`,
  );
}

async function png(svg, file) {
  await sharp(svg).png().toFile(path(file));
}

/** Writes a 24-bit uncompressed BMP (what NSIS and WiX expect). */
async function bmp(svg, width, height, file) {
  const { data } = await sharp(svg).resize(width, height).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const out = Buffer.alloc(54 + rowSize * height);
  out.write('BM', 0);
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(rowSize * height, 34);
  for (let y = 0; y < height; y++) {
    const dst = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      out[dst + x * 3] = data[i + 2];
      out[dst + x * 3 + 1] = data[i + 1];
      out[dst + x * 3 + 2] = data[i];
    }
  }
  writeFileSync(path(file), out);
}

const text = (x, y, size, fill, str, anchor = 'start', weight = 700) =>
  `<text x="${x}" y="${y}" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${str}</text>`;

function scene(w, h, body) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);
}

function placedMark(x, y, size, mono = false) {
  const s = size / 512;
  let inner = markInner;
  if (mono) inner = inner.replace(/fill="#eaf4f0"/gi, `fill="${PINE}"`);
  return `<g transform="translate(${x} ${y}) scale(${s})">${inner}</g>`;
}

// App icons
await png(markSquare(1024, 0.86, PINE, true), 'src-tauri/icons/source.png');
await png(markSquare(1024, 0.58, null), 'src-tauri/icons/android-foreground.png');
await png(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${PINE}"/></svg>`), 'src-tauri/icons/android-background.png');
await png(markSquare(1024, 0.58, null, false, true), 'src-tauri/icons/android-monochrome.png');

// NSIS: header 150×57 (top right of each page), sidebar 164×314 (welcome / finish pages)
await bmp(scene(150, 57, `<rect width="150" height="57" fill="#ffffff"/><rect x="99" y="5" width="47" height="47" rx="10" fill="${PINE}"/>${placedMark(102, 8, 41)}`), 150, 57, 'src-tauri/installer/nsis-header.bmp');
await bmp(
  scene(
    164,
    314,
    `<rect width="164" height="314" fill="${PINE}"/>${placedMark(22, 46, 120)}${text(82, 214, 19, '#ffffff', 'Alpine', 'middle')}${text(82, 238, 19, '#ffffff', 'OTA Updater', 'middle')}${text(82, 290, 10, '#cfe6de', 'MeshCore firmware updates', 'middle', 500)}`,
  ),
  164,
  314,
  'src-tauri/installer/nsis-sidebar.bmp',
);

// WiX: banner 493×58 (top of inner pages), dialog 493×312 (welcome / finish background)
await bmp(scene(493, 58, `<rect width="493" height="58" fill="#ffffff"/><rect x="438" y="6" width="46" height="46" rx="10" fill="${PINE}"/>${placedMark(441, 9, 40)}`), 493, 58, 'src-tauri/installer/wix-banner.bmp');
await bmp(
  scene(493, 312, `<rect width="493" height="312" fill="#ffffff"/><rect width="164" height="312" fill="${PINE}"/>${placedMark(22, 60, 120)}${text(82, 226, 19, '#ffffff', 'Alpine', 'middle')}${text(82, 250, 19, '#ffffff', 'OTA Updater', 'middle')}`),
  493,
  312,
  'src-tauri/installer/wix-dialog.bmp',
);

console.log('brand assets written');
