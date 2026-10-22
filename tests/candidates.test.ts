import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseName, classify, isFactoryBootloader, pickBootloader, type ScannedDevice } from '../src/lib/ble/candidates.ts';
import { DFU_SERVICE } from '../src/lib/dfu/legacy-dfu.ts';

const dev = (name: string, address: string, rssi = -60, services: string[] = []): ScannedDevice => ({ name, address, rssi, services });

test('classifies nodes in update mode', () => {
  assert.equal(classify(dev('T114_OTA', 'a')), 'app-ota');
  assert.equal(classify(dev('T114_DFU', 'a')), 'bootloader');
  assert.equal(classify(dev('AdaDFU', 'a')), 'bootloader');
  assert.equal(classify(dev('', 'a', -60, [DFU_SERVICE])), 'bootloader');
  assert.equal(classify(dev('MyPhone', 'a')), 'other');
  assert.equal(classify(dev('MeshCore-Amper', 'a')), 'companion');
});

test('baseName strips the mode suffix', () => {
  assert.equal(baseName('T114_OTA'), 'T114');
  assert.equal(baseName('T114_DFU'), 'T114');
  assert.equal(baseName('AdaDFU'), 'AdaDFU');
});

test('pickBootloader prefers the same address, then the same board name, then signal', () => {
  const prev = { address: 'AA', name: 'T114_OTA' };
  assert.equal(pickBootloader([dev('AdaDFU', 'BB', -40), dev('AdaDFU', 'AA', -80)], prev)?.address, 'AA');
  assert.equal(pickBootloader([dev('AdaDFU', 'BB', -40), dev('T114_DFU', 'CC', -80)], prev)?.address, 'CC');
  assert.equal(pickBootloader([dev('AdaDFU', 'BB', -70), dev('AdaDFU', 'DD', -50)], prev)?.address, 'DD');
  assert.equal(pickBootloader([dev('T114_OTA', 'AA'), dev('Phone', 'EE')], prev), undefined);
});

test('pickBootloader uses the selected board for a companion', () => {
  const prev = { address: 'AA', name: 'MeshCore-Amper', bootBase: 'T114' };
  assert.equal(pickBootloader([dev('AdaDFU', 'BB', -40), dev('T114_DFU', 'CC', -80)], prev)?.address, 'CC');
  assert.equal(pickBootloader([dev('MeshCore-Amper', 'AA')], prev), undefined);
});

test('factory bootloaders: Heltec "<MODEL>-OTA" names and the DIS firmware revision', () => {
  assert.equal(classify(dev('HT-n5262G-OTA', 'a')), 'bootloader');
  assert.equal(isFactoryBootloader('HT-n5262G-OTA'), true);
  assert.equal(isFactoryBootloader('AdaDFU'), true);
  assert.equal(isFactoryBootloader('T096_DFU'), false);
  assert.equal(isFactoryBootloader('AdaDFU', '0.9.2-OTAFIX2.3-BP1.4 s140 6.1.1'), false);
  assert.equal(isFactoryBootloader('T114_DFU', '0.6.2 s140 6.1.1'), true);
});
