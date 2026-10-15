import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packetSizeForMtu } from '../src/lib/dfu/legacy-dfu.ts';

test('packet size follows the MTU', () => {
  assert.equal(packetSizeForMtu(undefined), 20);
  assert.equal(packetSizeForMtu(23), 20);
  assert.equal(packetSizeForMtu(185), 182);
  assert.equal(packetSizeForMtu(247), 244);
  assert.equal(packetSizeForMtu(517), 244);
});
