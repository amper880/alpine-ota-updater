import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAMILY_BOOTLOADER,
  FAMILY_NRF52840,
  Uf2Error,
  crc16,
  initPacketSdReq,
  isUf2,
  softDeviceOfBootloader,
  uf2ToDfuPackage,
} from '../src/lib/dfu/uf2.ts';

/** Wraps an image into UF2 blocks of 256 bytes, like uf2conv.py. */
function makeUf2(image: Uint8Array, start: number, family = FAMILY_NRF52840): Uint8Array {
  const n = Math.ceil(image.length / 256);
  const out = new Uint8Array(n * 512);
  for (let i = 0; i < n; i++) {
    const v = new DataView(out.buffer, i * 512, 512);
    v.setUint32(0, 0x0a324655, true);
    v.setUint32(4, 0x9e5d5157, true);
    v.setUint32(8, 0x2000, true);
    v.setUint32(12, start + i * 256, true);
    v.setUint32(16, 256, true);
    v.setUint32(20, i, true);
    v.setUint32(24, n, true);
    v.setUint32(28, family, true);
    out.set(image.subarray(i * 256, (i + 1) * 256), i * 512 + 32);
    v.setUint32(508, 0x0ab16f30, true);
  }
  return out;
}

test('crc16 matches the Nordic SDK (values checked against MeshCore .dat files)', () => {
  assert.equal(crc16(new TextEncoder().encode('123456789')), 0x29b1);
  const ramp = new Uint8Array(1024).map((_, i) => i & 0xff);
  assert.equal(crc16(ramp), 0x758f);
});

test('UF2 for S140 6.1.1 becomes an application package with sd_req 0xB6', () => {
  const image = new Uint8Array(1000).map((_, i) => (i * 7) & 0xff);
  const uf2 = makeUf2(image, 0x26000);
  assert.ok(isUf2(uf2));
  const pkg = uf2ToDfuPackage(uf2);
  assert.equal(pkg.appStart, 0x26000);
  assert.equal(pkg.softDevice, 'S140 6.1.1');
  assert.deepEqual(pkg.firmware.subarray(0, 1000), image);
  assert.equal(pkg.firmware.length, 1024); // whole 256-byte UF2 payloads
  // Same layout as MeshCore's Heltec_t114 .dat: 5200 ffff ffffffff 0100 b600 <crc>
  assert.deepEqual([...pkg.initPacket.subarray(0, 12)], [0x52, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 1, 0, 0xb6, 0]);
  const crc = crc16(pkg.firmware);
  assert.deepEqual([...pkg.initPacket.subarray(12)], [crc & 0xff, crc >> 8]);
  assert.deepEqual(initPacketSdReq(pkg.initPacket), [0xb6]);
});

test('UF2 for S140 7.3.0 gets sd_req 0x123; unknown start and bootloader UF2s are refused', () => {
  assert.deepEqual(initPacketSdReq(uf2ToDfuPackage(makeUf2(new Uint8Array(512), 0x27000)).initPacket), [0x123]);
  assert.throws(() => uf2ToDfuPackage(makeUf2(new Uint8Array(512), 0x1000)), (e: unknown) => e instanceof Uf2Error && e.code === 'softdevice');
  assert.throws(() => uf2ToDfuPackage(makeUf2(new Uint8Array(512), 0xf4000, FAMILY_BOOTLOADER)), (e: unknown) => e instanceof Uf2Error && e.code === 'bootloader');
  assert.throws(() => uf2ToDfuPackage(makeUf2(new Uint8Array(512), 0x26000, 0x12345678)), (e: unknown) => e instanceof Uf2Error && e.code === 'family');
  assert.equal(isUf2(new Uint8Array([0x50, 0x4b, 3, 4])), false);
});

test('SoftDevice of a bootloader from its DIS firmware revision', () => {
  assert.equal(softDeviceOfBootloader('0.9.2-OTAFIX2.3-BP1.4 s140 6.1.1')?.fwid, 0xb6);
  assert.equal(softDeviceOfBootloader('0.8.0 s140 7.3.0')?.fwid, 0x123);
  assert.equal(softDeviceOfBootloader('0.6.0 s132 6.1.1'), undefined);
  assert.equal(softDeviceOfBootloader(undefined), undefined);
});
