import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLocalFile, isMergedEsp32Image } from '../src/lib/local/check.ts';

const espApp = () => {
  const b = new Uint8Array(0x10000);
  b[0] = 0xe9;
  return b;
};
const merged = () => {
  const b = espApp();
  b[0x8000] = 0xaa;
  b[0x8001] = 0x50;
  return b;
};

test('nRF52 accepts a zip, explains .uf2 / broken zips', () => {
  assert.equal(checkLocalFile('fw.zip', new Uint8Array([0x50, 0x4b, 3, 4]), 'nrf52'), undefined);
  assert.equal(checkLocalFile('fw.uf2', new Uint8Array([0x55, 0x46, 0x32, 0x0a]), 'nrf52'), 'not-zip');
  assert.equal(checkLocalFile('fw.zip', new Uint8Array([1, 2, 3, 4]), 'nrf52'), 'not-dfu');
  assert.equal(checkLocalFile('fw.zip', new Uint8Array(), 'nrf52'), 'empty');
});

test('ESP32 accepts app / MCUboot images, refuses merged and unknown ones', () => {
  assert.equal(checkLocalFile('Heltec_v3_repeater.bin', espApp(), 'esp32'), undefined);
  const mcuboot = new Uint8Array([0x3d, 0xb8, 0xf3, 0x96, 0, 0, 0, 0]);
  assert.equal(checkLocalFile('x-update.bin', mcuboot, 'esp32'), undefined);
  assert.equal(isMergedEsp32Image(merged()), true);
  assert.equal(checkLocalFile('fw.bin', merged(), 'esp32'), 'merged');
  assert.equal(checkLocalFile('fw-merged.bin', espApp(), 'esp32'), 'merged');
  assert.equal(checkLocalFile('fw.bin', new Uint8Array([1, 2, 3]), 'esp32'), 'not-ota-image');
  assert.equal(checkLocalFile('fw.zip', espApp(), 'esp32'), 'not-bin');
});
