/**
 * Actions for steps 4–5 on nRF52 nodes: scan for nodes in update mode and run the update.
 */
import { BOARDS, IDLE_FLASH, selectedBoard, store, type FlashStage, type PickedDevice } from './state.ts';
import { matchBleName } from '../lib/catalog/match.ts';
import { getFirmware } from '../lib/cache/db.ts';
import { parseDfuPackage } from '../lib/dfu/package.ts';
import { DfuError } from '../lib/dfu/legacy-dfu.ts';
import { classify, type ScannedDevice } from '../lib/ble/candidates.ts';
import { BleError, ensureBluetooth, scan, stopScan } from '../lib/ble/native.ts';
import { flashOverNativeBle } from '../lib/ble/flash-ble.ts';
import { isNativeApp } from '../lib/platform.ts';

const SCAN_MS = 12000;
let flashAbort: AbortController | undefined;

export async function startBleScan(): Promise<void> {
  if (store.get().scan.status === 'scanning') return;
  if (!isNativeApp()) {
    store.set((s) => ({ scan: { ...s.scan, error: 'app-only' } }));
    return;
  }
  store.set((s) => ({ scan: { ...s.scan, status: 'scanning', error: undefined, devices: [] } }));
  try {
    await ensureBluetooth();
    await scan((devices) => {
      const sorted = [...devices].sort((a, b) => b.rssi - a.rssi);
      store.set((s) => ({ scan: { ...s.scan, devices: sorted } }));
    }, SCAN_MS);
    store.set((s) => ({ scan: { ...s.scan, status: 'idle' } }));
  } catch (err) {
    const code = err instanceof BleError ? err.code : 'failed';
    store.set((s) => ({ scan: { ...s.scan, status: 'idle', error: code, errorDetail: (err as Error).message } }));
  }
}

export async function stopBleScan(): Promise<void> {
  await stopScan();
  store.set((s) => ({ scan: { ...s.scan, status: 'idle' } }));
}

export function setShowAll(showAll: boolean): void {
  store.set((s) => ({ scan: { ...s.scan, showAll } }));
}

export function selectDevice(d: ScannedDevice): void {
  void stopScan();
  const { match, knownAs } = matchBleName(BOARDS, d.name, selectedBoard()?.bleOtaName);
  const picked: PickedDevice = { id: d.address, name: d.name || d.address, match, knownAs, kind: classify(d) };
  store.set((s) => ({ device: picked, flash: IDLE_FLASH, openStep: undefined, scan: { ...s.scan, status: 'idle' } }));
}

export function forgetDevice(): void {
  store.set({ device: undefined, flash: IDLE_FLASH, openStep: undefined });
}

function log(message: string): void {
  const time = new Date().toLocaleTimeString(undefined, { hour12: false });
  store.set((s) => ({ flash: { ...s.flash, log: [...s.flash.log, `${time}  ${message}`] } }));
}

function setStage(stage: FlashStage): void {
  store.set((s) => ({ flash: { ...s.flash, stage } }));
}

export async function startFlash(prn: number): Promise<void> {
  const s = store.get();
  if (!s.device || !s.firmwareKey || s.flash.phase === 'running') return;
  flashAbort = new AbortController();
  store.set({ flash: { phase: 'running', stage: 'preparing', sent: 0, total: 0, log: [], startedAt: undefined } });
  try {
    const fw = await getFirmware(s.firmwareKey);
    if (!fw) throw new Error('Firmware file not found in the library. Download it again.');
    log(`Firmware ${fw.assetName} (${fw.size} bytes)`);
    const pkg = await parseDfuPackage(new Uint8Array(await fw.blob.arrayBuffer()));
    log(`Package: application ${pkg.firmware.length} bytes, init packet ${pkg.initPacket.length} bytes`);
    let lastProgress = 0;
    await flashOverNativeBle({ address: s.device.id, name: s.device.name }, pkg.firmware, pkg.initPacket, {
      prn,
      signal: flashAbort.signal,
      onLog: log,
      onStage: (stage) => setStage(stage),
      onProgress: (sent, total) => {
        const now = performance.now();
        if (now - lastProgress < 120 && sent !== total) return;
        lastProgress = now;
        store.set((st) => ({ flash: { ...st.flash, sent, total, startedAt: st.flash.startedAt ?? Date.now() } }));
      },
    });
    store.set((st) => ({ flash: { ...st.flash, phase: 'done', stage: undefined } }));
  } catch (err) {
    const aborted = err instanceof DfuError && err.code === 'aborted';
    log(aborted ? 'Cancelled' : `Error: ${(err as Error).message}`);
    store.set((st) => ({
      flash: { ...st.flash, phase: aborted ? 'cancelled' : 'error', stage: undefined, error: (err as Error).message },
    }));
  } finally {
    flashAbort = undefined;
  }
}

export function cancelFlash(): void {
  flashAbort?.abort();
}

export function resetFlash(): void {
  store.set({ flash: IDLE_FLASH });
}
