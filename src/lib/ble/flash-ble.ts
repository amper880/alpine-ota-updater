/**
 * Complete Bluetooth update of an nRF52 node:
 * connect → (application mode: buttonless jump, rescan, reconnect to the bootloader) → DFU.
 */
import { DfuError, IMAGE_APPLICATION, Op, VERSION_APP_MODE, packetSizeForMtu, runLegacyDfu } from '../dfu/legacy-dfu.ts';
import { isFactoryBootloader, pickBootloader, type ScannedDevice } from './candidates.ts';
import { connectNode, scan, stopScan, type NodeConnection } from './native.ts';
import { UserError, errorMessage } from '../util/errors.ts';

export type BleStage = 'connecting' | 'entering-bootloader' | 'reconnecting' | 'transferring' | 'finishing';

export interface BleFlashOptions {
  prn?: number;
  /** Force 20-byte packets (for bootloaders that reject larger writes). */
  compatPackets?: boolean;
  signal?: AbortSignal;
  onStage?: (stage: BleStage) => void;
  onProgress?: (sent: number, total: number) => void;
  onLog?: (message: string) => void;
  /** Called once the bootloader is known; `factory` = not OTAFIX (slower, careful settings). */
  onBootloader?: (info: { factory: boolean; firmwareRevision?: string; model?: string }) => void;
}

/** Settings the OTAFIX project recommends for factory bootloaders: receipt every 8 packets. */
const FACTORY_PRN = 8;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function timeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, sleep(ms).then(() => undefined)]);
}

/** Scans until a bootloader shows up (or the time runs out). */
async function findBootloader(previous: { address: string; name: string; bootBase?: string }, ms: number, log: (m: string) => void): Promise<ScannedDevice | undefined> {
  let found: ScannedDevice | undefined;
  let latest: ScannedDevice[] = [];
  const done = scan((devices) => {
    latest = devices;
    found = pickBootloader(devices, previous);
    if (found) void stopScan();
  }, ms);
  await done.catch((e) => log(`Scan error: ${errorMessage(e)}`));
  if (!found) log(`No bootloader seen; visible: ${latest.map((d) => d.name || d.address).join(', ') || 'none'}`);
  return found;
}

/**
 * Scans until the device is advertising (it may have changed address). Connecting right after a
 * fresh advertisement is more reliable on Windows.
 */
async function rediscover(
  device: { address: string; name: string },
  ms: number,
  log: (m: string) => void,
): Promise<string | undefined> {
  let address: string | undefined;
  let seen: string[] = [];
  try {
    await scan((devices) => {
      seen = devices.map((d) => `${d.name || '?'} ${d.address} ${d.rssi} dBm`);
      const hit = devices.find((d) => d.address === device.address) ?? devices.find((d) => d.name && d.name === device.name);
      if (hit && !address) {
        address = hit.address;
        void stopScan();
      }
    }, ms);
  } catch (err) {
    log(`Scan failed: ${errorMessage(err)}`);
  }
  if (!address) log(`Not seen during ${ms / 1000} s scan. Visible: ${seen.join('; ') || 'nothing'}`);
  return address;
}

const CONNECT_ATTEMPTS = 3;


/** The MTU is negotiated right after connecting; wait briefly for it to settle. */
async function choosePacketSize(conn: NodeConnection, log: (m: string) => void): Promise<number> {
  let mtu = await conn.mtu();
  for (let i = 0; i < 10 && (!mtu || mtu <= 23); i++) {
    await sleep(150);
    mtu = await conn.mtu();
  }
  const size = packetSizeForMtu(mtu);
  log(`MTU ${mtu ?? 'unknown'} → ${size}-byte packets`);
  return size;
}

/** Connects, rescanning before each retry; logs the platform's error text and timing. */
async function connectWithRetry(device: { address: string; name: string }, log: (m: string) => void): Promise<NodeConnection> {
  let address = device.address;
  let lastError = '';
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      log(`Scanning for ${device.name} before retry ${attempt}/${CONNECT_ATTEMPTS}`);
      const found = await rediscover({ address, name: device.name }, 8000, log);
      if (!found) continue;
      address = found;
    }
    log(`Connecting to ${device.name} (${address}), attempt ${attempt}/${CONNECT_ATTEMPTS}`);
    const started = Date.now();
    try {
      const c = await connectNode(address);
      log(`Connected in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      return c;
    } catch (err) {
      lastError = errorMessage(err);
      log(`Connect failed after ${((Date.now() - started) / 1000).toFixed(1)} s: ${lastError}`);
      await sleep(1000);
    }
  }
  throw new UserError('err.ble.connectFailed', `Could not connect to ${device.name}${lastError ? `: ${lastError}` : ''}`, {
    params: { name: device.name },
    detail: lastError,
  });
}

/** Pairing / encryption problems reported by the Bluetooth stacks (GATT status 0x05 / 0x0F). */
const AUTH_ERROR = /authenticat|encrypt|pair|bond|insufficient|0x0?5\b|0x0f\b|access is denied|not permitted|unauthori/i;

export interface BleTarget {
  address: string;
  name: string;
  /** "<BOARD>" of the selected board's "<BOARD>_OTA" name; finds its "<BOARD>_DFU" bootloader. */
  bootBase?: string;
  /** MeshCore Bluetooth companion: buttonless DFU behind pairing, always in application mode. */
  companion?: boolean;
}

export async function flashOverNativeBle(
  device: BleTarget,
  firmware: Uint8Array,
  initPacket: Uint8Array,
  opts: BleFlashOptions = {},
): Promise<void> {
  const log = opts.onLog ?? (() => undefined);
  const stage = opts.onStage ?? (() => undefined);
  const abortCheck = () => {
    if (opts.signal?.aborted) throw new DfuError('aborted', 'Update cancelled');
  };

  stage('connecting');
  let conn: NodeConnection = await connectWithRetry(device, log);
  /** Advertised name of the bootloader the image is sent to. */
  let bootName = device.name;
  log('Reading DFU version');
  const read = await conn.readVersionChecked();
  const version = read.version;
  log(`Connected; DFU version ${version === undefined ? `unknown${read.error ? ` (${read.error})` : ''}` : '0x' + version.toString(16).padStart(4, '0')}`);

  try {
    if (device.companion && version === undefined) {
      // The companion only shows its DFU service to paired clients.
      await conn.disconnect();
      if (read.error && AUTH_ERROR.test(read.error)) {
        throw new UserError('err.ble.pairing', `The companion requires pairing: ${read.error}`, { detail: read.error });
      }
      throw new UserError('err.ble.noDfuService', `The companion offers no Bluetooth update service${read.error ? `: ${read.error}` : ''}`, {
        detail: read.error,
      });
    }
    if (version === VERSION_APP_MODE) {
      abortCheck();
      stage('entering-bootloader');
      log(device.companion ? 'Companion is running; switching to the bootloader' : 'Node is running the application; switching to the bootloader');
      try {
        await conn.enableNotifications();
      } catch (err) {
        const msg = errorMessage(err);
        log(`Enabling notifications failed: ${msg}`);
        if (device.companion && AUTH_ERROR.test(msg)) {
          await conn.disconnect();
          throw new UserError('err.ble.pairing', `The companion requires pairing: ${msg}`, { detail: msg });
        }
      }
      try {
        await conn.writeControlRaw(new Uint8Array([Op.StartDfu, IMAGE_APPLICATION]));
      } catch (err) {
        log(`Jump command: ${errorMessage(err)} (expected if the node reset immediately)`);
      }
      const gone = await timeout(conn.disconnected.then(() => true), 8000);
      if (gone === undefined) {
        log('Node did not disconnect by itself; disconnecting');
        await conn.disconnect();
      }
      await sleep(1500);
      abortCheck();

      stage('reconnecting');
      log('Looking for the bootloader');
      const boot = await findBootloader(device, 20000, log);
      if (boot) {
        log(`Bootloader found: ${boot.name || '(no name)'} (${boot.address})`);
        conn = await connectWithRetry({ address: boot.address, name: boot.name }, log);
        bootName = boot.name;
      } else {
        // Some systems keep showing the old name for the same address; try that address and
        // check whether the bootloader answers there.
        log(`Trying the previous address ${device.address}`);
        const c = await connectWithRetry(device, log);
        const v = await c.readVersion();
        if (v === VERSION_APP_MODE) {
          await c.disconnect();
          throw new UserError('err.ble.noBootloader', 'The node did not switch to the bootloader. Put it into DFU mode manually and scan again.');
        }
        log(`Bootloader answers at the same address (DFU version ${v === undefined ? 'unknown' : '0x' + v.toString(16).padStart(4, '0')})`);
        conn = c;
      }
    }

    abortCheck();
    // Identify the bootloader: factory bootloaders get small packets and frequent receipts.
    const info = await conn.readDeviceInfo();
    const factory = isFactoryBootloader(bootName, info.firmwareRevision);
    log(
      `Bootloader: ${info.firmwareRevision ?? 'version unknown'}` +
        `${info.manufacturer || info.model ? ` (${[info.manufacturer, info.model].filter(Boolean).join(' ')})` : ''}` +
        ` — ${factory ? 'factory bootloader' : 'OTAFIX'}`,
    );
    opts.onBootloader?.({ factory, firmwareRevision: info.firmwareRevision, model: info.model });
    let prn = opts.prn;
    let compat = opts.compatPackets;
    if (factory) {
      compat = true;
      if (prn === undefined || prn === 0 || prn > FACTORY_PRN) prn = FACTORY_PRN;
      log(`Factory bootloader: using 20-byte packets and a receipt every ${prn} packets`);
    }
    const packetSize = compat ? 20 : await choosePacketSize(conn, log);
    stage('transferring');
    let t0 = Date.now();
    const transfer = (c: NodeConnection, settings: { prn?: number; packetSize: number }) =>
      runLegacyDfu(c.transport(), firmware, initPacket, {
        ...settings,
        signal: opts.signal,
        onProgress: opts.onProgress,
        onLog: log,
      });
    try {
      await transfer(conn, { prn, packetSize });
    } catch (err) {
      // The bootloader stays in DFU mode after a failed transfer. Unless the careful settings
      // were already in use, start over once with them (small packets, frequent receipts).
      const careful = packetSize <= 20 && prn !== undefined && prn > 0 && prn <= FACTORY_PRN;
      if (careful || opts.signal?.aborted || (err instanceof DfuError && err.code === 'aborted')) throw err;
      log(`Transfer failed: ${errorMessage(err)}`);
      log(`Retrying from the start with 20-byte packets and a receipt every ${FACTORY_PRN} packets`);
      await conn.disconnect();
      await sleep(2000);
      abortCheck();
      stage('reconnecting');
      const boot = await findBootloader({ address: conn.address, name: bootName, bootBase: device.bootBase }, 15000, log);
      conn = await connectWithRetry(boot ? { address: boot.address, name: boot.name } : { address: conn.address, name: bootName }, log);
      stage('transferring');
      t0 = Date.now();
      await transfer(conn, { prn: FACTORY_PRN, packetSize: 20 });
    }
    const secs = (Date.now() - t0) / 1000;
    log(`Transferred ${firmware.length} bytes in ${secs.toFixed(1)} s (${(firmware.length / 1000 / secs).toFixed(1)} kB/s)`);
  } finally {
    stage('finishing');
    await sleep(500);
    await conn.disconnect();
  }
}
