/**
 * Native Bluetooth Low Energy access through tauri-plugin-blec (btleplug on Windows/iOS/macOS,
 * a Kotlin backend on Android). Unlike Web Bluetooth there is no blocklist, so the Nordic
 * legacy DFU service can be used.
 */
import * as blec from '@mnlphlp/plugin-blec';
import { DFU_CONTROL_POINT, DFU_PACKET, DFU_SERVICE, DFU_VERSION, type DfuTransport } from '../dfu/legacy-dfu.ts';
import type { ScannedDevice } from './candidates.ts';
import { errorMessage } from '../util/errors.ts';

export type BleErrorCode = 'permission' | 'adapter-off';

export class BleError extends Error {
  readonly code: BleErrorCode;
  constructor(code: BleErrorCode, message: string) {
    super(message);
    this.name = 'BleError';
    this.code = code;
  }
}

/** Asks for Bluetooth permissions (Android) and checks that the adapter is on. */
let androidMtuRequested = false;

export async function ensureBluetooth(): Promise<void> {
  if (!androidMtuRequested) {
    androidMtuRequested = true;
    // Ask Android for the largest MTU so DFU packets can be up to 244 bytes (no-op elsewhere;
    // older plugin versions lack the call).
    await Promise.resolve()
      .then(() => (blec as { setAndroidMtu?: (m: number) => Promise<void> }).setAndroidMtu?.(247))
      .catch(() => undefined);
  }
  if (!(await blec.checkPermissions(true))) throw new BleError('permission', 'Bluetooth permission denied');
  const state = await blec.getAdapterState().catch(() => 'Unknown' as const);
  if (state === 'Off') throw new BleError('adapter-off', 'Bluetooth is turned off');
}

let finishActiveScan: (() => void) | undefined;

/**
 * Scans for `timeoutMs`; `onDevices` receives the full list each time it changes.
 * The plugin's scan command returns as soon as scanning has started, so this waits for the
 * timeout (or for `stopScan()`) before resolving.
 */
export async function scan(onDevices: (devices: ScannedDevice[]) => void, timeoutMs: number): Promise<void> {
  finishActiveScan?.();
  let finished = false;
  await blec.startScan((devices) => {
    if (finished) return;
    onDevices(
      devices.map((d) => ({
        address: d.address,
        name: d.name ?? '',
        rssi: d.rssi,
        services: (d.services ?? []).map((s) => s.toLowerCase()),
      })),
    );
  }, timeoutMs);
  await new Promise<void>((resolve) => {
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (finishActiveScan === done) finishActiveScan = undefined;
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    finishActiveScan = done;
  });
}

export async function stopScan(): Promise<void> {
  finishActiveScan?.();
  await blec.stopScan().catch(() => undefined);
}

export interface DeviceInfo {
  manufacturer?: string;
  model?: string;
  /** e.g. "0.9.2-OTAFIX2.3-BP1.4 s140 6.1.1" on Adafruit-based bootloaders. */
  firmwareRevision?: string;
}

const DIS_SERVICE = '0000180a-0000-1000-8000-00805f9b34fb';
const DIS_CHAR = (short: string) => `0000${short}-0000-1000-8000-00805f9b34fb`;

export interface NodeConnection {
  address: string;
  /** DFU Version characteristic; 0x0001 = application (buttonless), otherwise bootloader. */
  readVersion(): Promise<number | undefined>;
  /** Like readVersion, but also returns the error text when the read fails. */
  readVersionChecked(): Promise<{ version?: number; error?: string }>;
  /** Device Information Service strings (bootloaders expose them without pairing). */
  readDeviceInfo(): Promise<DeviceInfo>;
  /** Negotiated ATT MTU, if the platform reports it. */
  mtu(): Promise<number | undefined>;
  /** Enables control point notifications (the buttonless service rejects writes without). */
  enableNotifications(): Promise<void>;
  /** Writes to the control point without waiting for a DFU response (buttonless jump). */
  writeControlRaw(data: Uint8Array): Promise<void>;
  transport(): DfuTransport;
  disconnect(): Promise<void>;
  /** Resolves when the device disconnects. */
  disconnected: Promise<void>;
}

const toArray = (d: Uint8Array) => Array.from(d);

/**
 * Connects to one node. Only one node is connected at a time, so the module-level functions
 * of the plugin (which address "the connected device") are used; they exist in all plugin
 * versions this app supports.
 */
export async function connectNode(address: string): Promise<NodeConnection> {
  await blec.disconnect().catch(() => undefined);
  let markDisconnected!: () => void;
  const disconnected = new Promise<void>((r) => (markDisconnected = r));
  try {
    await blec.connect(address, () => markDisconnected());
  } catch (err) {
    throw new Error(errorMessage(err));
  }
  let subscribed = false;
  const readVersionChecked = async (): Promise<{ version?: number; error?: string }> => {
    try {
      const v = await blec.read(DFU_VERSION, DFU_SERVICE);
      return { version: v.length >= 2 ? v[0] | (v[1] << 8) : v[0] };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  };
  const readString = async (short: string): Promise<string | undefined> => {
    try {
      const v = await blec.read(DIS_CHAR(short), DIS_SERVICE);
      const s = new TextDecoder().decode(Uint8Array.from(v)).replace(/\0+$/, '').trim();
      return s || undefined;
    } catch {
      return undefined;
    }
  };
  return {
    address,
    disconnected,
    readVersionChecked,
    async readDeviceInfo() {
      return {
        manufacturer: await readString('2a29'),
        model: await readString('2a24'),
        firmwareRevision: await readString('2a26'),
      };
    },
    async readVersion() {
      return (await readVersionChecked()).version;
    },
    async mtu() {
      try {
        return await blec.getMtu();
      } catch {
        return undefined;
      }
    },
    async enableNotifications() {
      if (subscribed) return;
      await blec.subscribe(DFU_CONTROL_POINT, DFU_SERVICE, () => undefined);
      subscribed = true;
    },
    async writeControlRaw(data) {
      await blec.send(DFU_CONTROL_POINT, toArray(data), 'withResponse', DFU_SERVICE);
    },
    transport(): DfuTransport {
      return {
        async startNotifications(onNotify) {
          if (subscribed) await blec.unsubscribe(DFU_CONTROL_POINT, DFU_SERVICE).catch(() => undefined);
          await blec.subscribe(DFU_CONTROL_POINT, DFU_SERVICE, (data) => onNotify(new DataView(Uint8Array.from(data).buffer)));
          subscribed = true;
        },
        writeControl: (d) => blec.send(DFU_CONTROL_POINT, toArray(d), 'withResponse', DFU_SERVICE),
        writePacket: (d) => blec.send(DFU_PACKET, toArray(d), 'withoutResponse', DFU_SERVICE),
      };
    },
    async disconnect() {
      if (subscribed) await blec.unsubscribe(DFU_CONTROL_POINT, DFU_SERVICE).catch(() => undefined);
      await blec.disconnect().catch(() => undefined);
    },
  };
}
