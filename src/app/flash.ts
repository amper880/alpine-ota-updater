/**
 * Actions for steps 4–5 on nRF52 nodes: pick the node over Bluetooth and run the update.
 */
import { BOARDS, IDLE_FLASH, selectedBoard, store, type FlashStage, type PickedDevice } from './state.ts';
import { matchBleName } from '../lib/catalog/match.ts';
import { getFirmware } from '../lib/cache/db.ts';
import { parseDfuPackage } from '../lib/dfu/package.ts';
import { DfuError } from '../lib/dfu/legacy-dfu.ts';
import { BOOTLOADER_NAME, flashOverBle, requestBootloader, requestOtaDevice } from '../lib/dfu/web-bluetooth.ts';

let bleDevice: BluetoothDevice | undefined;
let flashAbort: AbortController | undefined;
let bootloaderPick: { resolve: (d: BluetoothDevice) => void; reject: (e: Error) => void } | undefined;

/** Known `<BOARD>_OTA` names of all nRF52 boards. */
export function otaNames(): string[] {
  return [...new Set(BOARDS.map((b) => b.bleOtaName).filter((n): n is string => !!n))];
}


export async function scanBle(showAll = false): Promise<void> {
  store.set({ scanError: undefined });
  try {
    const device = await requestOtaDevice(otaNames(), showAll);
    bleDevice = device;
    const name = device.name ?? '';
    const { match, knownAs } = matchBleName(BOARDS, name, selectedBoard()?.bleOtaName);
    const picked: PickedDevice = { id: device.id, name: name || device.id, match, knownAs };
    store.set({ device: picked, flash: IDLE_FLASH, openStep: undefined });
  } catch (err) {
    const e = err as Error;
    // NotFoundError = the user closed the chooser; not an error worth showing.
    if (e.name === 'NotFoundError') return;
    store.set({ scanError: e.message });
  }
}

export function forgetDevice(): void {
  try {
    bleDevice?.gatt?.disconnect();
  } catch {
    /* ignore */
  }
  bleDevice = undefined;
  store.set({ device: undefined, flash: IDLE_FLASH, openStep: undefined });
}

function log(message: string): void {
  const time = new Date().toLocaleTimeString(undefined, { hour12: false });
  store.set((s) => ({ flash: { ...s.flash, log: [...s.flash.log, `${time}  ${message}`] } }));
}

function setStage(stage: FlashStage): void {
  store.set((s) => ({ flash: { ...s.flash, stage } }));
}

/** Called from the "Select bootloader" button (needs the click for the chooser). */
export async function pickBootloaderNow(): Promise<void> {
  if (!bootloaderPick) return;
  try {
    const d = await requestBootloader();
    bootloaderPick.resolve(d);
  } catch (err) {
    if ((err as Error).name === 'NotFoundError') return; // chooser closed; keep waiting
    bootloaderPick.reject(err as Error);
  }
}

async function wakeLock(): Promise<{ release(): Promise<void> } | undefined> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    return await wl?.request('screen');
  } catch {
    return undefined;
  }
}

const preventUnload = (e: BeforeUnloadEvent) => {
  e.preventDefault();
};

export async function startFlash(prn: number): Promise<void> {
  const s = store.get();
  if (!bleDevice || !s.firmwareKey || s.flash.phase === 'running') return;
  flashAbort = new AbortController();
  store.set({ flash: { phase: 'running', stage: 'preparing', sent: 0, total: 0, log: [], startedAt: undefined } });
  const lock = await wakeLock();
  addEventListener('beforeunload', preventUnload);
  try {
    const fw = await getFirmware(s.firmwareKey);
    if (!fw) throw new Error('Firmware file not found in the library. Download it again.');
    log(`Firmware ${fw.assetName} (${fw.size} bytes)`);
    const pkg = await parseDfuPackage(new Uint8Array(await fw.blob.arrayBuffer()));
    log(`Package: application ${pkg.firmware.length} bytes, init packet ${pkg.initPacket.length} bytes`);
    let lastProgress = 0;
    await flashOverBle(bleDevice, pkg.firmware, pkg.initPacket, {
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
      pickBootloader: () =>
        new Promise<BluetoothDevice>((resolve, reject) => {
          bootloaderPick = {
            resolve: (d) => {
              bootloaderPick = undefined;
              bleDevice = d;
              resolve(d);
            },
            reject: (e) => {
              bootloaderPick = undefined;
              reject(e);
            },
          };
          flashAbort?.signal.addEventListener('abort', () => bootloaderPick?.reject(new DfuError('aborted', 'Update cancelled')), { once: true });
        }),
    });
    store.set((st) => ({ flash: { ...st.flash, phase: 'done', stage: undefined } }));
  } catch (err) {
    const aborted = err instanceof DfuError && err.code === 'aborted';
    log(aborted ? 'Cancelled' : `Error: ${(err as Error).message}`);
    store.set((st) => ({
      flash: { ...st.flash, phase: aborted ? 'cancelled' : 'error', stage: undefined, error: (err as Error).message },
    }));
  } finally {
    removeEventListener('beforeunload', preventUnload);
    await lock?.release().catch(() => undefined);
    flashAbort = undefined;
    bootloaderPick = undefined;
  }
}

export function cancelFlash(): void {
  flashAbort?.abort();
}

export function resetFlash(): void {
  store.set({ flash: IDLE_FLASH });
}

export { BOOTLOADER_NAME };
