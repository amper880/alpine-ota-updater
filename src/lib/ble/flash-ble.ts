/**
 * Complete Bluetooth update of an nRF52 node:
 * connect → (application mode: buttonless jump, rescan, reconnect to the bootloader) → DFU.
 */
import { DfuError, IMAGE_APPLICATION, Op, VERSION_APP_MODE, runLegacyDfu } from '../dfu/legacy-dfu.ts';
import { pickBootloader, type ScannedDevice } from './candidates.ts';
import { connectNode, scan, stopScan, type NodeConnection } from './native.ts';
import { errorMessage } from '../util/errors.ts';

export type BleStage = 'connecting' | 'entering-bootloader' | 'reconnecting' | 'transferring' | 'finishing';

export interface BleFlashOptions {
  prn?: number;
  signal?: AbortSignal;
  onStage?: (stage: BleStage) => void;
  onProgress?: (sent: number, total: number) => void;
  onLog?: (message: string) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function timeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, sleep(ms).then(() => undefined)]);
}

/** Scans until a bootloader shows up (or the time runs out). */
async function findBootloader(previous: { address: string; name: string }, ms: number, log: (m: string) => void): Promise<ScannedDevice | undefined> {
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

/** Rescans briefly until the device is visible again (it may have changed address). */
async function rediscover(device: { address: string; name: string }, ms: number): Promise<string | undefined> {
  let address: string | undefined;
  await scan((devices) => {
    const hit = devices.find((d) => d.address === device.address) ?? devices.find((d) => d.name && d.name === device.name);
    if (hit) {
      address = hit.address;
      void stopScan();
    }
  }, ms).catch(() => undefined);
  return address;
}

/** Connects; on failure rescans once and retries, logging the platform's error text. */
async function connectWithRetry(device: { address: string; name: string }, log: (m: string) => void): Promise<NodeConnection> {
  log(`Connecting to ${device.name} (${device.address})`);
  const started = Date.now();
  try {
    const c = await connectNode(device.address);
    log(`Connected in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return c;
  } catch (err) {
    log(`Connect failed after ${((Date.now() - started) / 1000).toFixed(1)} s: ${errorMessage(err)}`);
  }
  log('Scanning again before retrying');
  const address = await rediscover(device, 6000);
  if (!address) throw new Error(`${device.name} is no longer visible. Put it into update mode again and rescan.`);
  log(`Retrying connection to ${address}`);
  try {
    return await connectNode(address);
  } catch (err) {
    throw new Error(`Could not connect to ${device.name}: ${errorMessage(err)}`);
  }
}

export async function flashOverNativeBle(
  device: { address: string; name: string },
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
  log('Reading DFU version');
  const version = await conn.readVersion();
  log(`Connected; DFU version ${version === undefined ? 'unknown' : '0x' + version.toString(16).padStart(4, '0')}`);

  try {
    if (version === VERSION_APP_MODE) {
      abortCheck();
      stage('entering-bootloader');
      log('Node is running the application; switching to the bootloader');
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
      if (!boot) throw new DfuError('transport', 'The bootloader did not appear. Restart the node into DFU mode and scan again.');
      log(`Bootloader found: ${boot.name || '(no name)'} (${boot.address})`);
      conn = await connectNode(boot.address);
    }

    abortCheck();
    stage('transferring');
    await runLegacyDfu(conn.transport(), firmware, initPacket, {
      prn: opts.prn,
      signal: opts.signal,
      onProgress: opts.onProgress,
      onLog: log,
    });
  } finally {
    stage('finishing');
    await sleep(500);
    await conn.disconnect();
  }
}
