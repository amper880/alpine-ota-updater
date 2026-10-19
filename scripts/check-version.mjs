#!/usr/bin/env node
/**
 * CI guard for release tags: the version in package.json (used for the app, the installer
 * file names and the Android versionCode) must match the pushed tag, e.g. tag "v0.5.0" or
 * "v0.5.0-beta" for version "0.5.0". Fails early instead of publishing mislabelled files.
 *
 * Usage: node scripts/check-version.mjs <tag>
 */
import { readFileSync } from 'node:fs';

const tag = (process.argv[2] ?? '').replace(/^refs\/tags\//, '');
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ok = tag === `v${version}` || tag.startsWith(`v${version}-`);
if (!ok) {
  console.error(
    `::error::Tag ${tag} does not match package.json version ${version}. ` +
      'Bump "version" in package.json (and run npm install), commit, then move the tag.',
  );
  process.exit(1);
}
console.log(`Tag ${tag} matches version ${version}`);
