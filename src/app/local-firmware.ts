/**
 * Firmware files picked from disk (source "Custom firmware file" in step 2, file chooser in
 * step 3). They are checked, stored in the firmware library like downloads (source id
 * "local") and selected for the update.
 */
import { LOCAL_SOURCE, refreshCached, selectedBoard, store, useFirmware } from './state.ts';
import { putFirmware, type CachedFirmware } from '../lib/cache/db.ts';
import { parseDfuPackage } from '../lib/dfu/package.ts';
import { checkLocalFile } from '../lib/local/check.ts';
import { imageKind } from '../lib/wifi/ota-format.ts';
import { UserError, toErrorInfo } from '../lib/util/errors.ts';

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function addLocalFirmware(file: File): Promise<void> {
  const board = selectedBoard();
  if (!board) return;
  store.set({ localFile: { status: 'checking' } });
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const problem = checkLocalFile(file.name, bytes, board.platform);
    if (problem) throw new UserError(`err.local.${problem}`, `${file.name}: ${problem}`);
    if (board.platform === 'nrf52') {
      try {
        await parseDfuPackage(bytes);
      } catch (err) {
        throw new UserError('err.local.not-dfu', `${file.name}: not a DFU package`, { detail: toErrorInfo(err).detail });
      }
    }
    const sha256 = toHex(await crypto.subtle.digest('SHA-256', bytes));
    const s = store.get();
    const record: CachedFirmware = {
      key: `${LOCAL_SOURCE}/${board.id}/${sha256.slice(0, 16)}/${file.name}`,
      sourceId: LOCAL_SOURCE,
      repo: '',
      tag: '',
      version: file.name,
      boardId: board.id,
      role: s.role,
      platform: board.platform,
      assetName: file.name,
      size: bytes.length,
      sha256,
      downloadedAt: new Date().toISOString(),
      blob: new Blob([bytes], { type: 'application/octet-stream' }),
      imageKind: board.platform === 'esp32' ? imageKind(bytes) : undefined,
    };
    await putFirmware(record);
    await refreshCached();
    useFirmware(record.key);
  } catch (err) {
    store.set({ localFile: { status: 'idle', error: toErrorInfo(err, 'err.storage') } });
  }
}

export function clearLocalFileError(): void {
  store.set({ localFile: { status: 'idle' } });
}
