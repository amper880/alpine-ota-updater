import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UserError, classifyMessage, errorMessage, toErrorInfo } from '../src/lib/util/errors.ts';
import { DfuError } from '../src/lib/dfu/legacy-dfu.ts';
import { DfuPackageError } from '../src/lib/dfu/package.ts';
import en from '../src/i18n/locales/en.json' with { type: 'json' };

test('errorMessage handles plugin strings, errors and objects', () => {
  assert.equal(errorMessage('Btleplug error: timed out'), 'Btleplug error: timed out');
  assert.equal(errorMessage(new Error('boom')), 'boom');
  assert.equal(errorMessage({ message: 'x' }), 'x');
  assert.equal(errorMessage({ code: 5 }), '{"code":5}');
  assert.equal(errorMessage(undefined), 'undefined');
});

test('native Bluetooth texts are recognised', () => {
  assert.equal(classifyMessage('no bluetooth adapters found')?.key, 'err.ble.noAdapter');
  assert.equal(classifyMessage('Bluetooth adapter is powered off')?.key, 'err.ble.off');
  assert.equal(classifyMessage('Not connected')?.key, 'err.ble.connection');
  assert.equal(classifyMessage('Error { HRESULT 0x806500FD }')?.key, 'err.ble.connection');
  assert.equal(classifyMessage('Permission denied')?.key, 'err.ble.permission');
});

test('network texts and HTTP status codes are recognised', () => {
  assert.equal(classifyMessage('error sending request for url (http://192.168.4.1/update)')?.key, 'err.network');
  assert.equal(classifyMessage('operation timed out')?.key, 'err.timeout');
  assert.deepEqual(classifyMessage('GitHub API: HTTP 502'), { key: 'err.http', params: { status: '502' } });
  assert.equal(classifyMessage('something nobody has seen'), undefined);
});

test('toErrorInfo keeps the raw text as detail', () => {
  const info = toErrorInfo('no bluetooth adapters found');
  assert.deepEqual(info, { key: 'err.ble.noAdapter', detail: 'no bluetooth adapters found' });
  assert.equal(toErrorInfo(new Error('weird')).key, 'err.unknown');
  assert.equal(toErrorInfo(new Error('weird'), 'err.network').key, 'err.network');
});

test('typed errors map to their keys', () => {
  const u = new UserError('err.ble.connectFailed', 'Could not connect to X', { params: { name: 'X' }, detail: 'Not connected' });
  assert.deepEqual(toErrorInfo(u), { key: 'err.ble.connectFailed', params: { name: 'X' }, detail: 'Not connected' });
  assert.equal(toErrorInfo(new DfuError('status', 'Data transfer failed: CRC error')).key, 'err.dfu.status');
  assert.equal(toErrorInfo(new DfuError('transport', 'Packet write failed: Not connected')).key, 'err.ble.connection');
  assert.equal(toErrorInfo(new DfuError('transport', 'Packet write failed: ???')).key, 'err.dfu.transport');
  assert.equal(toErrorInfo(new DfuPackageError('manifest.json missing')).key, 'err.dfu.package');
});

test('every key the error layer can produce is translated', () => {
  const keys = Object.keys(en).filter((k) => k.startsWith('err.'));
  for (const k of ['err.ble.noAdapter', 'err.ble.off', 'err.ble.permission', 'err.network', 'err.timeout', 'err.ble.connection', 'err.storage', 'err.http', 'err.dfu.status', 'err.dfu.timeout', 'err.dfu.transport', 'err.dfu.package', 'err.cancelled']) {
    assert.ok(keys.includes(k), k);
  }
});
