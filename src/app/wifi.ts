/**
 * Actions for steps 4–5 on ESP32 nodes: find the node on its OTA WiFi and upload the image.
 */
import { IDLE_FLASH, selectedBoard, store } from './state.ts';
import { matchWifiBoard } from '../lib/catalog/match.ts';
import { getFirmware } from '../lib/cache/db.ts';
import { md5Hex } from '../lib/util/md5.ts';
import { errorMessage } from '../lib/util/errors.ts';
import { OTA_HOST, probeNode, uploadFirmware } from '../lib/wifi/elegant-ota.ts';
import { isNativeApp } from '../lib/platform.ts';

let uploadAbort: AbortController | undefined;

/** "Scan" for ESP32: checks whether a node answers on http://192.168.4.1. */
export async function findWifiNode(): Promise<void> {
  if (store.get().scan.status === 'scanning') return;
  if (!isNativeApp()) {
    store.set((s) => ({ scan: { ...s.scan, error: 'app-only' } }));
    return;
  }
  store.set((s) => ({ scan: { ...s.scan, status: 'scanning', error: undefined, errorDetail: undefined } }));
  const r = await probeNode();
  if (!r.ok) {
    store.set((s) => ({ scan: { ...s.scan, status: 'idle', error: 'unreachable', errorDetail: r.error } }));
    return;
  }
  const board = selectedBoard();
  const reported = r.identity?.board ?? '';
  const match = board && reported ? matchWifiBoard(reported, board) : 'unknown';
  store.set((s) => ({
    scan: { ...s.scan, status: 'idle' },
    device: {
      id: OTA_HOST,
      name: r.identity ? r.identity.id : OTA_HOST.replace('http://', ''),
      match,
      knownAs: reported ? [reported] : [],
      kind: 'wifi',
    },
    flash: IDLE_FLASH,
    openStep: undefined,
  }));
}

function log(message: string): void {
  const time = new Date().toLocaleTimeString(undefined, { hour12: false });
  store.set((s) => ({ flash: { ...s.flash, log: [...s.flash.log, `${time}  ${message}`] } }));
}

export async function startWifiFlash(): Promise<void> {
  const s = store.get();
  if (!s.device || !s.firmwareKey || s.flash.phase === 'running') return;
  uploadAbort = new AbortController();
  store.set({ flash: { phase: 'running', stage: 'preparing', sent: 0, total: 0, log: [], startedAt: undefined } });
  try {
    const fw = await getFirmware(s.firmwareKey);
    if (!fw) throw new Error('Firmware file not found in the library. Download it again.');
    const image = new Uint8Array(await fw.blob.arrayBuffer());
    if (image[0] !== 0xe9) log('Warning: the file does not start with the ESP32 image magic byte (0xE9)');
    const md5 = md5Hex(image);
    log(`Firmware ${fw.assetName} (${image.length} bytes, MD5 ${md5})`);
    log(`Uploading to ${OTA_HOST}/update`);
    store.set((st) => ({ flash: { ...st.flash, stage: 'uploading', total: image.length, startedAt: Date.now() } }));
    const t0 = Date.now();
    await uploadFirmware(image, md5, { signal: uploadAbort.signal });
    const secs = (Date.now() - t0) / 1000;
    log(`Node answered OK after ${secs.toFixed(1)} s (${(image.length / 1000 / secs).toFixed(1)} kB/s); it restarts now`);
    store.set((st) => ({ flash: { ...st.flash, phase: 'done', stage: undefined, sent: image.length } }));
  } catch (err) {
    const cancelled = uploadAbort?.signal.aborted ?? false;
    log(cancelled ? 'Cancelled' : `Error: ${errorMessage(err)}`);
    store.set((st) => ({ flash: { ...st.flash, phase: cancelled ? 'cancelled' : 'error', stage: undefined, error: errorMessage(err) } }));
  } finally {
    uploadAbort = undefined;
  }
}

export function cancelWifiFlash(): void {
  uploadAbort?.abort();
}
