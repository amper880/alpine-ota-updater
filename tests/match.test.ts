import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFirmware, matchBleName, matchWifiBoard, parseAsset, versionOf } from '../src/lib/catalog/match.ts';
import type { Board, Release, SourceConfig } from '../src/lib/catalog/types.ts';
import sourcesJson from '../catalog/sources.json' with { type: 'json' };
import boardsJson from '../catalog/boards.json' with { type: 'json' };

const sources = sourcesJson.sources as SourceConfig[];
const boards = boardsJson.boards as Board[];
const src = (id: string) => sources.find((s) => s.id === id)!;
const board = (id: string) => {
  const b = boards.find((x) => x.id === id);
  assert.ok(b, `board ${id} missing from catalog`);
  return b;
};

const rel = (tag: string, assets: string[], extra: Partial<Release> = {}): Release => ({
  tag,
  name: tag,
  publishedAt: '2026-10-15T10:00:00Z',
  prerelease: false,
  draft: false,
  body: '',
  htmlUrl: `https://example.invalid/${tag}`,
  assets: assets.map((name) => ({ name, size: 1000 })),
  ...extra,
});

test('official: nRF52 DFU zip is selected, uf2 ignored', () => {
  const r = rel('repeater-v1.18.0', [
    'RAK_4631_repeater-v1.18.0-81dbae5.uf2',
    'RAK_4631_repeater-v1.18.0-81dbae5.zip',
  ]);
  const out = findFirmware(src('official'), [r], board('rak4631'), 'repeater');
  assert.equal(out.length, 1);
  assert.equal(out[0].asset.name, 'RAK_4631_repeater-v1.18.0-81dbae5.zip');
  assert.equal(out[0].version, '1.18.0');
  assert.equal(out[0].platform, 'nrf52');
});

test('official: ESP32 picks the non-merged bin, also with capitalised role', () => {
  const r = rel('repeater-v1.18.0', [
    'ThinkNode_M2_Repeater-v1.18.0-81dbae5-merged.bin',
    'ThinkNode_M2_Repeater-v1.18.0-81dbae5.bin',
  ]);
  const out = findFirmware(src('official'), [r], board('thinknodem2'), 'repeater');
  assert.equal(out[0]?.asset.name, 'ThinkNode_M2_Repeater-v1.18.0-81dbae5.bin');
});

test('official: role-specific tags are respected', () => {
  const repeater = rel('repeater-v1.18.0', ['Heltec_v3_repeater-v1.18.0-81dbae5.bin']);
  const room = rel('room-server-v1.18.0', ['Heltec_v3_room_server-v1.18.0-81dbae5.bin']);
  const companion = rel('companion-v1.18.0', ['Heltec_v3_companion_radio_ble-v1.18.0-81dbae5.bin']);
  const all = [repeater, room, companion];
  assert.equal(findFirmware(src('official'), all, board('heltecv3'), 'repeater').length, 1);
  const rs = findFirmware(src('official'), all, board('heltecv3'), 'room-server');
  assert.equal(rs.length, 1);
  assert.equal(rs[0].asset.name, 'Heltec_v3_room_server-v1.18.0-81dbae5.bin');
});

test('official: "Heltec_t114" does not match "Heltec_t114_without_display"', () => {
  const r = rel('repeater-v1.18.0', [
    'Heltec_t114_without_display_repeater-v1.18.0-81dbae5.zip',
    'Heltec_t114_repeater-v1.18.0-81dbae5.zip',
  ]);
  const out = findFirmware(src('official'), [r], board('heltect114'), 'repeater');
  assert.equal(out[0].asset.name, 'Heltec_t114_repeater-v1.18.0-81dbae5.zip');
});

test('pre-releases and drafts are skipped by default', () => {
  const a = rel('repeater-v1.19.0', ['RAK_4631_repeater-v1.19.0-aaaaaaa.zip'], { prerelease: true });
  const b = rel('repeater-v1.18.1', ['RAK_4631_repeater-v1.18.1-bbbbbbb.zip'], { draft: true });
  const c = rel('repeater-v1.18.0', ['RAK_4631_repeater-v1.18.0-81dbae5.zip']);
  const out = findFirmware(src('official'), [a, b, c], board('rak4631'), 'repeater');
  assert.deepEqual(out.map((o) => o.version), ['1.18.0']);
  const withPre = findFirmware(src('official'), [a, b, c], board('rak4631'), 'repeater', { includePrerelease: true });
  assert.equal(withPre.length, 2);
});

test('powersaving: ESP32 uses -upgrade.bin, freshInstall is excluded', () => {
  const r = rel('PowerSaving17', [
    'Heltec_ct62_repeater-PowerSaving17-freshInstall-merged.bin',
    'Heltec_ct62_repeater-PowerSaving17-upgrade.bin',
    'GAT562_30S_Mesh_Kit_repeater-PowerSaving17.uf2',
    'GAT562_30S_Mesh_Kit_repeater-PowerSaving17.zip',
  ]);
  const esp = findFirmware(src('powersaving'), [r], board('heltecct62'), 'repeater');
  assert.equal(esp[0]?.asset.name, 'Heltec_ct62_repeater-PowerSaving17-upgrade.bin');
  assert.equal(esp[0]?.version, '17');
  const nrf = findFirmware(src('powersaving'), [r], board('gat56230smeshkit'), 'repeater');
  assert.equal(nrf[0]?.asset.name, 'GAT562_30S_Mesh_Kit_repeater-PowerSaving17.zip');
});

test('zephcore: nRF52 zip and ESP32 -update.bin with Zephyr board names', () => {
  const r = rel('1.18.0-zephcore', [
    'heltec_t114-repeater-4f63ee2.uf2',
    'heltec_t114-repeater-4f63ee2.zip',
    'heltec_t114-repeater-noscreen-4f63ee2.zip',
    'heltec_wifi_lora32_v3-esp32s3-procpu-repeater-4f63ee2-merged.bin',
    'heltec_wifi_lora32_v3-esp32s3-procpu-repeater-4f63ee2-update.bin',
    'heltec_wifi_lora32_v3-esp32s3-procpu-companion-4f63ee2-update.bin',
    'xiao_esp32c3-repeater-4f63ee2-update.bin',
    'ttgo_tbeam-esp32-procpu-repeater-4f63ee2.bin',
  ]);
  const z = src('zephcore');
  assert.equal(findFirmware(z, [r], board('heltect114'), 'repeater')[0]?.asset.name, 'heltec_t114-repeater-4f63ee2.zip');
  assert.equal(findFirmware(z, [r], board('heltect114withoutdisplay'), 'repeater')[0]?.asset.name, 'heltec_t114-repeater-noscreen-4f63ee2.zip');
  const v3 = findFirmware(z, [r], board('heltecv3'), 'repeater');
  assert.equal(v3[0]?.asset.name, 'heltec_wifi_lora32_v3-esp32s3-procpu-repeater-4f63ee2-update.bin');
  assert.equal(v3[0]?.version, '1.18.0');
  assert.equal(findFirmware(z, [r], board('xiaoc3'), 'repeater')[0]?.asset.name, 'xiao_esp32c3-repeater-4f63ee2-update.bin');
  // plain .bin without "-update" is not an OTA image for ZephCore
  assert.equal(findFirmware(z, [r], board('tbeamsx1276'), 'repeater').length, 0);
});

test('every ZephCore alias points to a catalog board', () => {
  for (const id of Object.values(src('zephcore').boardAliases ?? {})) board(id);
});

test('companion: only the nRF52 Bluetooth companion is offered', () => {
  const official = src('official');
  assert.deepEqual(parseAsset(official, 'RAK_4631_companion_radio_ble-v1.18.0-81dbae5.zip'), { boardKey: 'rak4631', role: 'companion', platform: 'nrf52' });
  assert.equal(parseAsset(official, 'RAK_4631_companion_radio_usb-v1.18.0-81dbae5.zip'), undefined);
  assert.equal(parseAsset(official, 'Heltec_v3_companion_radio_ble-v1.18.0-81dbae5.bin'), undefined);
  assert.equal(parseAsset(official, 'Heltec_v3_companion_radio_wifi-v1.18.0-81dbae5.bin'), undefined);
  const r = rel('companion-v1.18.0', [
    'Heltec_t114_companion_radio_usb-v1.18.0-81dbae5.zip',
    'Heltec_t114_companion_radio_ble-v1.18.0-81dbae5.zip',
    'Heltec_t114_companion_radio_ble-v1.18.0-81dbae5.uf2',
  ]);
  const rep = rel('repeater-v1.18.0', ['Heltec_t114_repeater-v1.18.0-81dbae5.zip']);
  const out = findFirmware(official, [r, rep], board('heltect114'), 'companion');
  assert.deepEqual(out.map((o) => o.asset.name), ['Heltec_t114_companion_radio_ble-v1.18.0-81dbae5.zip']);
  // and the companion release never leaks into the repeater list
  assert.deepEqual(findFirmware(official, [r, rep], board('heltect114'), 'repeater').map((o) => o.asset.name), ['Heltec_t114_repeater-v1.18.0-81dbae5.zip']);
});

test('zephcore: companion zip on nRF52, none on ESP32', () => {
  const z = src('zephcore');
  assert.equal(parseAsset(z, 'heltec_t114-companion-4f63ee2.zip')?.role, 'companion');
  assert.equal(parseAsset(z, 'heltec_wifi_lora32_v3-esp32s3-procpu-companion-4f63ee2-update.bin'), undefined);
});

test('catalog: companion role only on nRF52 boards', () => {
  assert.deepEqual(boards.filter((b) => b.roles.includes('companion') && b.platform !== 'nrf52').map((b) => b.id), []);
  assert.ok(board('heltect114').roles.includes('companion'));
});

test('versionOf falls back to the tag', () => {
  assert.equal(versionOf({ ...src('official'), versionPattern: undefined }, 'x'), 'x');
});

test('catalog: every nRF52 board has a BLE OTA name', () => {
  const missing = boards.filter((b) => b.platform === 'nrf52' && !b.bleOtaName).map((b) => b.id);
  assert.deepEqual(missing, []);
});

test('BLE name matching', () => {
  const t114 = board('heltect114');
  assert.equal(matchBleName(boards, 'T114_OTA', t114.bleOtaName).match, 'match');
  const m = matchBleName(boards, 'RAK4631_OTA', t114.bleOtaName);
  assert.equal(m.match, 'mismatch');
  assert.ok(m.knownAs.includes(board('rak4631').name));
  assert.equal(matchBleName(boards, 'AdaDFU', t114.bleOtaName).match, 'unknown');
  assert.equal(matchBleName(boards, 'T114_DFU', t114.bleOtaName).match, 'match');
  assert.equal(matchBleName(boards, 'RAK4631_DFU', t114.bleOtaName).match, 'mismatch');
});

test('WiFi board name matching', () => {
  assert.equal(matchWifiBoard('Heltec V3', board('heltecv3')), 'match');
  assert.equal(matchWifiBoard('Station G2', board('stationg2')), 'match');
  assert.equal(matchWifiBoard('Xiao C3', board('xiaoc3')), 'match');
  assert.equal(matchWifiBoard('Generic ESP32', board('heltecv3')), 'unknown');
  assert.equal(matchWifiBoard('', board('heltecv3')), 'unknown');
});
