/**
 * Web Bluetooth glue for the legacy DFU protocol:
 * device selection, the buttonless jump from the application into the bootloader,
 * reconnection, and a `DfuTransport` over GATT characteristics.
 */
import {
  DFU_CONTROL_POINT,
  DFU_PACKET,
  DFU_SERVICE,
  DFU_VERSION,
  DfuError,
  IMAGE_APPLICATION,
  Op,
  VERSION_APP_MODE,
  runLegacyDfu,
  type DfuTransport,
} from './legacy-dfu.ts';

/** Name the Adafruit bootloader advertises in OTA DFU mode. */
export const BOOTLOADER_NAME = 'AdaDFU';

export function hasWebBluetooth(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export async function bluetoothAvailable(): Promise<boolean> {
  try {
    return hasWebBluetooth() && (await navigator.bluetooth!.getAvailability());
  } catch {
    return false;
  }
}

/**
 * Opens the browser's device chooser, filtered to nodes in OTA mode (`<BOARD>_OTA`) and
 * bootloaders. `showAll` lists every nearby device instead.
 */
export function requestOtaDevice(otaNames: string[], showAll = false): Promise<BluetoothDevice> {
  const bt = navigator.bluetooth;
  if (!bt) return Promise.reject(new Error('Web Bluetooth is not available'));
  if (showAll) return bt.requestDevice({ acceptAllDevices: true, optionalServices: [DFU_SERVICE] });
  const names = [...new Set(otaNames)];
  return bt.requestDevice({
    filters: [...names.map((name) => ({ name })), { namePrefix: BOOTLOADER_NAME }, { namePrefix: 'OTAFIX' }, { services: [DFU_SERVICE] }],
    optionalServices: [DFU_SERVICE],
  });
}

/** Opens the chooser for the bootloader only (used when automatic reconnection fails). */
export function requestBootloader(): Promise<BluetoothDevice> {
  const bt = navigator.bluetooth;
  if (!bt) return Promise.reject(new Error('Web Bluetooth is not available'));
  return bt.requestDevice({
    filters: [{ namePrefix: BOOTLOADER_NAME }, { namePrefix: 'OTAFIX' }, { services: [DFU_SERVICE] }],
    optionalServices: [DFU_SERVICE],
  });
}

interface DfuConnection {
  server: BluetoothRemoteGATTServer;
  control: BluetoothRemoteGATTCharacteristic;
  packet: BluetoothRemoteGATTCharacteristic;
  /** DFU Version characteristic value; undefined if the characteristic is missing. */
  version?: number;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DfuError('aborted', 'Update cancelled'));
      },
      { once: true },
    );
  });

async function connect(device: BluetoothDevice): Promise<DfuConnection> {
  if (!device.gatt) throw new Error('Device has no GATT server');
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(DFU_SERVICE);
  const control = await service.getCharacteristic(DFU_CONTROL_POINT);
  const packet = await service.getCharacteristic(DFU_PACKET);
  let version: number | undefined;
  try {
    const v = await (await service.getCharacteristic(DFU_VERSION)).readValue();
    version = v.byteLength >= 2 ? v.getUint16(0, true) : v.getUint8(0);
  } catch {
    version = undefined;
  }
  return { server, control, packet, version };
}

function waitForDisconnect(device: BluetoothDevice, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (!device.gatt?.connected) return resolve();
    const done = () => {
      clearTimeout(timer);
      device.removeEventListener('gattserverdisconnected', done);
      resolve();
    };
    const timer = setTimeout(() => {
      device.removeEventListener('gattserverdisconnected', done);
      try {
        device.gatt?.disconnect();
      } catch {
        /* ignore */
      }
      resolve();
    }, timeoutMs);
    device.addEventListener('gattserverdisconnected', done);
  });
}

function transportFor(conn: DfuConnection): DfuTransport {
  return {
    async startNotifications(onNotify) {
      conn.control.addEventListener('characteristicvaluechanged', (e) => {
        const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (v) onNotify(v);
      });
      await conn.control.startNotifications();
    },
    writeControl: (d) => conn.control.writeValueWithResponse(d as BufferSource),
    writePacket: (d) => conn.packet.writeValueWithoutResponse(d as BufferSource),
  };
}

export type BleStage = 'connecting' | 'entering-bootloader' | 'reconnecting' | 'pick-bootloader' | 'transferring' | 'finishing';

export interface BleFlashOptions {
  prn?: number;
  signal?: AbortSignal;
  onStage?: (stage: BleStage) => void;
  onProgress?: (sent: number, total: number) => void;
  onLog?: (message: string) => void;
  /**
   * Called when the bootloader cannot be reached automatically. Must resolve with a device
   * picked by the user (the chooser needs a click, so the UI shows a button).
   */
  pickBootloader: () => Promise<BluetoothDevice>;
}

/**
 * Full BLE update: connect, jump to the bootloader if the node is still running the
 * application, reconnect, transfer the image.
 */
export async function flashOverBle(
  device: BluetoothDevice,
  firmware: Uint8Array,
  initPacket: Uint8Array,
  opts: BleFlashOptions,
): Promise<void> {
  const log = opts.onLog ?? (() => undefined);
  const stage = opts.onStage ?? (() => undefined);
  const signal = opts.signal;

  stage('connecting');
  log(`Connecting to ${device.name ?? device.id}`);
  let conn = await connect(device);
  log(`Connected; DFU version ${conn.version === undefined ? 'unknown' : '0x' + conn.version.toString(16).padStart(4, '0')}`);

  if (conn.version === VERSION_APP_MODE) {
    stage('entering-bootloader');
    log('Node is running the application; switching to the bootloader');
    try {
      await conn.control.startNotifications();
    } catch {
      /* some app-mode services do not need notifications */
    }
    try {
      await conn.control.writeValueWithResponse(new Uint8Array([Op.StartDfu, IMAGE_APPLICATION]));
    } catch {
      // The node may reset before acknowledging.
    }
    await waitForDisconnect(device, 6000);

    stage('reconnecting');
    let target: BluetoothDevice = device;
    let reconnected: DfuConnection | undefined;
    for (let attempt = 1; attempt <= 8 && !reconnected; attempt++) {
      await sleep(attempt === 1 ? 1500 : 1000, signal);
      try {
        log(`Reconnecting to the bootloader (attempt ${attempt})`);
        const c = await connect(device);
        if (c.version === VERSION_APP_MODE) {
          log('Still in application mode, waiting');
          c.server.disconnect();
          continue;
        }
        reconnected = c;
      } catch (err) {
        log(`Not reachable yet: ${(err as Error).message}`);
      }
    }
    if (!reconnected) {
      stage('pick-bootloader');
      log('Bootloader uses a different Bluetooth identity; waiting for the user to select it');
      target = await opts.pickBootloader();
      stage('reconnecting');
      log(`Connecting to ${target.name ?? target.id}`);
      reconnected = await connect(target);
    }
    conn = reconnected;
    device = target;
    log('Bootloader connected');
  }

  stage('transferring');
  try {
    await runLegacyDfu(transportFor(conn), firmware, initPacket, {
      prn: opts.prn,
      signal,
      onProgress: opts.onProgress,
      onLog: log,
    });
  } finally {
    stage('finishing');
    await sleep(500).catch(() => undefined);
    try {
      if (conn.server.connected) conn.server.disconnect();
    } catch {
      /* ignore */
    }
  }
}
