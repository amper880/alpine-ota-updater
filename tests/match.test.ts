import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFirmware, parseAsset, versionOf } from '../src/lib/catalog/match.ts';
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

test('zephcore: lowercase names match, ESP32 is not offered', () => {
  const r = rel('1.17.4-zephcore', ['heltec_t114-repeater-eef6a48.zip', 'heltec_v3-repeater-eef6a48.bin']);
  const nrf = findFirmware(src('zephcore'), [r], board('heltect114'), 'repeater');
  assert.equal(nrf[0]?.asset.name, 'heltec_t114-repeater-eef6a48.zip');
  assert.equal(nrf[0]?.version, '1.17.4');
  assert.equal(findFirmware(src('zephcore'), [r], board('heltecv3'), 'repeater').length, 0);
});

test('companion images are never parsed as repeater/room server', () => {
  assert.equal(parseAsset(src('official'), 'RAK_4631_companion_radio_ble-v1.18.0-81dbae5.zip'), undefined);
});

test('versionOf falls back to the tag', () => {
  assert.equal(versionOf({ ...src('official'), versionPattern: undefined }, 'x'), 'x');
});

test('catalog: every nRF52 board has a BLE OTA name', () => {
  const missing = boards.filter((b) => b.platform === 'nrf52' && !b.bleOtaName).map((b) => b.id);
  assert.deepEqual(missing, []);
});
