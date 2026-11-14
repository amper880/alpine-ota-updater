import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrationApplies, migratorAsset, pickMigratorRelease, sdMajor } from '../src/lib/migrate/mctozc.ts';
import { SOFTDEVICES } from '../src/lib/dfu/uf2.ts';
import type { Release } from '../src/lib/catalog/types.ts';

const rel = (tag: string, names: string[], extra: Partial<Release> = {}): Release => ({
  tag,
  name: tag,
  publishedAt: '2026-11-01T00:00:00Z',
  prerelease: false,
  draft: false,
  body: '',
  htmlUrl: '',
  assets: names.map((name) => ({ name, size: 75000 })),
  ...extra,
});

test('migrator build follows the SoftDevice under the bootloader', () => {
  assert.equal(migratorAsset(sdMajor(SOFTDEVICES[0])), 'MeshCore_to_ZephCore_SoftDevice_v6.zip');
  assert.equal(migratorAsset(sdMajor(SOFTDEVICES[1])), 'MeshCore_to_ZephCore_SoftDevice_v7.zip');
});

test('picks the newest stable release with both builds', () => {
  const both = [migratorAsset(6), migratorAsset(7)];
  const releases = [
    rel('v1.2.0', both, { prerelease: true }),
    rel('v1.1.0', [migratorAsset(7)]),
    rel('v1.0.0', both),
  ];
  assert.equal(pickMigratorRelease(releases)?.tag, 'v1.0.0');
  assert.equal(pickMigratorRelease([rel('v1.0.0', [migratorAsset(6)])]), undefined);
});

test('migration is offered only for ZephCore nRF52 repeater images', () => {
  assert.equal(migrationApplies({ sourceId: 'zephcore', role: 'repeater', platform: 'nrf52' }), true);
  assert.equal(migrationApplies({ sourceId: 'zephcore', role: 'companion', platform: 'nrf52' }), false);
  assert.equal(migrationApplies({ sourceId: 'zephcore', role: 'repeater', platform: 'esp32' }), false);
  assert.equal(migrationApplies({ sourceId: 'official', role: 'repeater', platform: 'nrf52' }), false);
});
