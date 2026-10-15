#!/usr/bin/env node
/**
 * Renders the PNG app icons from the SVG sources. Requires `sharp`:
 *   npm i -D sharp && node scripts/make-icons.mjs
 * The generated PNGs are committed, so this only needs to run when the icon changes.
 */
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const dir = new URL('../public/icons/', import.meta.url);
const icon = readFileSync(new URL('icon.svg', dir));
const maskable = readFileSync(new URL('icon-maskable.svg', dir));
await sharp(icon).resize(192, 192).png().toFile(new URL('icon-192.png', dir).pathname);
await sharp(icon).resize(512, 512).png().toFile(new URL('icon-512.png', dir).pathname);
await sharp(maskable).resize(512, 512).png().toFile(new URL('icon-maskable-512.png', dir).pathname);
console.log('icons written');
