import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, isNewer, parseVersion, pickInstaller } from '../src/lib/update/version.ts';

test('version comparison', () => {
  assert.deepEqual(parseVersion('v0.5.0-beta'), [0, 5, 0]);
  assert.equal(isNewer('v0.6.0', '0.5.0'), true);
  assert.equal(isNewer('v0.5.1', '0.5.0'), true);
  assert.equal(isNewer('v1.0', '0.9.9'), true);
  assert.equal(isNewer('v0.5.0', '0.5.0'), false);
  assert.equal(isNewer('v0.5.0-beta', '0.5.0'), false);
  assert.equal(isNewer('v0.4.9', '0.5.0'), false);
  assert.equal(isNewer('nightly', '0.5.0'), false);
});

test('platform and installer selection', () => {
  const assets = [
    'Alpine.OTA.Updater_0.6.0_x64-setup.exe',
    'Alpine.OTA.Updater_0.6.0_x64_en-US.msi',
    'Alpine.OTA.Updater_0.6.0_universal.dmg',
    'Alpine.OTA.Updater_0.6.0_amd64.AppImage',
    'alpine-ota-updater-0.6.0.apk',
  ].map((name) => ({ name, url: `https://x/${name}` }));
  const ua = {
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/141',
    android: 'Mozilla/5.0 (Linux; Android 13; T50Pro) AppleWebKit/537.36 Chrome/141 Mobile',
    macos: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15',
  };
  assert.equal(pickInstaller(assets, detectPlatform(ua.windows)), 'https://x/Alpine.OTA.Updater_0.6.0_x64-setup.exe');
  assert.equal(pickInstaller(assets, detectPlatform(ua.android)), 'https://x/alpine-ota-updater-0.6.0.apk');
  assert.equal(pickInstaller(assets, detectPlatform(ua.macos)), 'https://x/Alpine.OTA.Updater_0.6.0_universal.dmg');
  assert.equal(pickInstaller(assets, detectPlatform(ua.linux)), 'https://x/Alpine.OTA.Updater_0.6.0_amd64.AppImage');
  assert.equal(pickInstaller([], 'windows'), undefined);
});
