import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage } from '../src/lib/util/errors.ts';

test('errorMessage handles plugin strings, errors and objects', () => {
  assert.equal(errorMessage('Btleplug error: timed out'), 'Btleplug error: timed out');
  assert.equal(errorMessage(new Error('boom')), 'boom');
  assert.equal(errorMessage({ message: 'x' }), 'x');
  assert.equal(errorMessage({ code: 5 }), '{"code":5}');
  assert.equal(errorMessage(undefined), 'undefined');
});
