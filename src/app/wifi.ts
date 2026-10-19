/**
 * Actions for steps 4–5 on ESP32 nodes: find the node on its OTA WiFi and upload the image.
 */
import { IDLE_FLASH, LOCAL_SOURCE, SOURCES, selectedBoard, selectedSource, store } from './state.ts';
import { matchWifiBoard, resolveAlias } from '../lib/catalog/match.ts';
import { getFirmware } from '../lib/cache/db.ts';
import { UserError, errorMessage, toErrorInfo } from '../lib/util/errors.ts';
import { probeNode, uploadFirmware } from '../lib/wifi/ota.ts';
import { OTA_PROFILES, imageKind, type OtaKind, type OtaProfile } from '../lib/wifi/ota-format.ts';
import { isNativeApp } from '../lib/platform.ts';

let uploadAbort: AbortController | undefined;

/** OTA server variant the selected firmware source runs (for the connection guide). */
export function expectedProfile(): OtaProfile {
  const s = store.get();
  if (s.sourceId === LOCAL_SOURCE) {
    // A custom file tells by its format which OTA server the node must run.
    const kind = s.firmwareKey ? s.cached[s.firmwareKey]?.imageKind : undefined;
    return OTA_PROFILES[kind === 'mcuboot' ? 'zephcore' : 'meshcore'];
  }
  return OTA_PROFILES[(selectedSource()?.wifiOta ?? 'meshcore') as OtaKind];
}

/** "Scan" for ESP32: checks whether a node answers on one of the OTA addresses. */
export async function findWifiNode(): Promise<void> {
  if (store.get().scan.status === 'scanning') return;
  if (!isNativeApp()) {
    store.set((s) => ({ scan: { ...s.scan, error: 'app-only' } }));
    return;
  }
  store.set((s) => ({ scan: { ...s.scan, status: 'scanning', error: undefined, errorDetail: undefined } }));
  const r = await probeNode();
  if (!r.ok) {
    store.set((s) => ({ scan: { ...s.scan, status: 'idle', error: 'unreachable', errorDetail: { key: 'err.unknown', detail: r.error } } }));
    return;
  }
  const board = selectedBoard();
  const reported = r.identity?.board ?? '';
  // ZephCore reports Zephyr board names ("heltec_wifi_lora32_v3"); map them like file names.
  let match: 'match' | 'unknown' = 'unknown';
  if (board && reported) {
    const aliased = SOURCES.map((src) => resolveAlias(src, reported));
    match = aliased.includes(board.id) ? 'match' : matchWifiBoard(reported, board) === 'match' ? 'match' : 'unknown';
  }
  store.set((s) => ({
    scan: { ...s.scan, status: 'idle' },
    device: {
      id: r.profile.host,
      name: r.identity ? r.identity.id : r.profile.host.replace('http://', ''),
      match,
      knownAs: reported ? [reported] : [],
      kind: 'wifi',
      ota: r.profile.kind,
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
  const profile = OTA_PROFILES[s.device.ota ?? 'meshcore'];
  uploadAbort = new AbortController();
  store.set({ flash: { phase: 'running', stage: 'preparing', sent: 0, total: 0, log: [], startedAt: undefined } });
  try {
    const fw = await getFirmware(s.firmwareKey);
    if (!fw) throw new UserError('err.fwMissing', 'Firmware file not found in the library. Download it again.');
    const image = new Uint8Array(await fw.blob.arrayBuffer());
    const kind = imageKind(image);
    log(`Firmware ${fw.assetName} (${image.length} bytes, ${kind} image)`);
    log(`Node runs ${profile.label} OTA at ${profile.host}`);
    if (kind !== 'unknown' && kind !== profile.image) {
      const other = Object.values(OTA_PROFILES).find((p) => p.image === kind);
      throw new UserError(
        'err.wifi.wrongFamily',
        `This node runs ${profile.label}, but the selected file is a ${other?.label ?? kind} image. ` +
          `Choose a ${profile.label} firmware; switching between them needs a USB flash.`,
        { params: { node: profile.label, file: other?.label ?? kind } },
      );
    }
    store.set((st) => ({ flash: { ...st.flash, stage: 'uploading', total: image.length, startedAt: Date.now() } }));
    const t0 = Date.now();
    await uploadFirmware(profile, image, { signal: uploadAbort.signal, onLog: log });
    const secs = (Date.now() - t0) / 1000;
    log(`Node answered OK after ${secs.toFixed(1)} s (${(image.length / 1000 / secs).toFixed(1)} kB/s); it restarts now`);
    store.set((st) => ({ flash: { ...st.flash, phase: 'done', stage: undefined, sent: image.length } }));
  } catch (err) {
    const cancelled = uploadAbort?.signal.aborted ?? false;
    log(cancelled ? 'Cancelled' : `Error: ${errorMessage(err)}`);
    store.set((st) => ({ flash: { ...st.flash, phase: cancelled ? 'cancelled' : 'error', stage: undefined, error: toErrorInfo(err) } }));
  } finally {
    uploadAbort = undefined;
  }
}

export function cancelWifiFlash(): void {
  uploadAbort?.abort();
}
