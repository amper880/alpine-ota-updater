import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { md5Hex } from '../src/lib/util/md5.ts';
import { buildUploadBody, parseIdentity } from '../src/lib/wifi/ota-format.ts';

test('md5 matches Node crypto', () => {
  for (const len of [0, 1, 55, 56, 63, 64, 65, 1000, 123457]) {
    const data = new Uint8Array(len).map((_, i) => (i * 31 + 7) % 256);
    assert.equal(md5Hex(data), createHash('md5').update(data).digest('hex'), `length ${len}`);
  }
  assert.equal(md5Hex(new TextEncoder().encode('abc')), '900150983cd24fb0d6963f7d28e17f72');
});

test('parses the ElegantOTA identity', () => {
  assert.deepEqual(parseIdentity({ id: 'Rooftop (Heltec V3)', hardware: 'ESP32' }), {
    id: 'Rooftop (Heltec V3)',
    name: 'Rooftop',
    board: 'Heltec V3',
    hardware: 'ESP32',
  });
  assert.equal(parseIdentity({ id: 'Plain' })?.board, '');
  assert.equal(parseIdentity('nope'), undefined);
});

test('multipart body has MD5 before the file', () => {
  const body = new TextDecoder('latin1').decode(buildUploadBody(new Uint8Array([1, 2, 3]), 'abc123', 'B'));
  const md5At = body.indexOf('name="MD5"');
  const fileAt = body.indexOf('name="firmware"');
  assert.ok(md5At > 0 && fileAt > md5At);
  assert.ok(body.includes('\r\n\r\nabc123\r\n--B\r\n'));
  assert.ok(body.endsWith('\r\n--B--\r\n'));
});
