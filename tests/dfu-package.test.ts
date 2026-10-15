import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDfuPackage, DfuPackageError } from '../src/lib/dfu/package.ts';
import { listZip } from '../src/lib/util/zip.ts';
import { makeZip } from './helpers/zip-writer.ts';

const manifest = JSON.stringify({
  manifest: { application: { bin_file: 'app.bin', dat_file: 'app.dat', init_packet_data: { device_type: 82 } }, dfu_version: 0.5 },
});
const bin = new Uint8Array(5000).map((_, i) => i % 251);
const dat = new Uint8Array([0x52, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 1, 0, 0xfe, 0xff, 0x12, 0x34]);

for (const deflate of [true, false]) {
  test(`parses a ${deflate ? 'deflated' : 'stored'} DFU package`, async () => {
    const zip = makeZip({ 'manifest.json': manifest, 'app.bin': bin, 'app.dat': dat }, deflate);
    assert.equal(listZip(zip).length, 3);
    const pkg = await parseDfuPackage(zip);
    assert.deepEqual(pkg.firmware, bin);
    assert.deepEqual(pkg.initPacket, dat);
  });
}

test('rejects packages without an application', async () => {
  const zip = makeZip({ 'manifest.json': JSON.stringify({ manifest: { bootloader: { bin_file: 'b.bin', dat_file: 'b.dat' } } }) });
  await assert.rejects(parseDfuPackage(zip), DfuPackageError);
});

test('rejects non-zip data', async () => {
  await assert.rejects(parseDfuPackage(new Uint8Array(100)), DfuPackageError);
});
