/**
 * Nordic legacy DFU protocol (nRF5 SDK ≤ 11), as implemented by the Adafruit nRF52 bootloader
 * and its OTAFIX fork used on MeshCore nRF52 boards.
 *
 * This module only speaks the protocol; the BLE plumbing is behind `DfuTransport`, so the same
 * code is unit-tested against a simulated bootloader (tests/dfu.test.ts).
 *
 * Reference: Nordic "DFU BLE Service" (legacy), nRF5 SDK 11 documentation, and
 * Nordic-Semiconductor/Android-DFU-Library LegacyDfuImpl.
 */

import { errorMessage } from '../util/errors.ts';

export const DFU_SERVICE = '00001530-1212-efde-1523-785feabcd123';
export const DFU_CONTROL_POINT = '00001531-1212-efde-1523-785feabcd123';
export const DFU_PACKET = '00001532-1212-efde-1523-785feabcd123';
export const DFU_VERSION = '00001534-1212-efde-1523-785feabcd123';

/** Control point op codes. */
export const Op = {
  StartDfu: 0x01,
  InitDfuParams: 0x02,
  ReceiveFirmwareImage: 0x03,
  ValidateFirmware: 0x04,
  ActivateAndReset: 0x05,
  Reset: 0x06,
  PacketReceiptNotifRequest: 0x08,
  Response: 0x10,
  PacketReceiptNotif: 0x11,
} as const;
type OpCode = (typeof Op)[keyof typeof Op];

/** Image type for START_DFU. */
export const IMAGE_APPLICATION = 0x04;

/** DFU Version characteristic value reported by the application (buttonless) service. */
export const VERSION_APP_MODE = 0x0001;

const STATUS_TEXT: Record<number, string> = {
  1: 'success',
  2: 'invalid state',
  3: 'not supported',
  4: 'data size exceeds limit',
  5: 'CRC error',
  6: 'operation failed',
};

export class DfuError extends Error {
  readonly code: 'timeout' | 'status' | 'aborted' | 'transport';
  constructor(code: DfuError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/** BLE operations the protocol needs. Implemented with Web Bluetooth in web-bluetooth.ts. */
export interface DfuTransport {
  /** Subscribe to control point notifications. */
  startNotifications(onNotify: (data: DataView) => void): Promise<void>;
  /** Write to the control point (with response). */
  writeControl(data: Uint8Array): Promise<void>;
  /** Write to the packet characteristic (without response). */
  writePacket(data: Uint8Array): Promise<void>;
}

export interface DfuOptions {
  /** Packets between receipt notifications (flow control). 0 disables PRN. */
  prn?: number;
  /** Bytes per packet; legacy bootloaders use the default ATT MTU (20 bytes). */
  packetSize?: number;
  /** Timeout for each control point response, in ms. */
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (sent: number, total: number) => void;
  onLog?: (message: string) => void;
}

/** Collects notifications and lets the protocol wait for a specific one. */
class NotificationQueue {
  private items: Uint8Array[] = [];
  private waiter?: { match: (d: Uint8Array) => boolean; resolve: (d: Uint8Array) => void };

  push(view: DataView): void {
    const bytes = new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
    if (this.waiter && this.waiter.match(bytes)) {
      const w = this.waiter;
      this.waiter = undefined;
      w.resolve(bytes);
    } else {
      this.items.push(bytes);
    }
  }

  wait(match: (d: Uint8Array) => boolean, timeoutMs: number, signal?: AbortSignal, what = 'response'): Promise<Uint8Array> {
    const idx = this.items.findIndex(match);
    if (idx >= 0) return Promise.resolve(this.items.splice(idx, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = undefined;
        signal?.removeEventListener('abort', onAbort);
        reject(new DfuError('timeout', `Timed out waiting for ${what}`));
      }, timeoutMs);
      const onAbort = () => {
        clearTimeout(timer);
        this.waiter = undefined;
        reject(new DfuError('aborted', 'Update cancelled'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiter = {
        match,
        resolve: (d) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          resolve(d);
        },
      };
    });
  }

  /** Drops stale receipt notifications. */
  clearReceipts(): void {
    this.items = this.items.filter((d) => d[0] !== Op.PacketReceiptNotif);
  }
}

const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

/**
 * Runs a complete application update on a device that is already in bootloader (DFU) mode
 * and connected through `transport`.
 */
export async function runLegacyDfu(
  transport: DfuTransport,
  firmware: Uint8Array,
  initPacket: Uint8Array,
  opts: DfuOptions = {},
): Promise<void> {
  const prn = opts.prn ?? 8;
  const packetSize = opts.packetSize ?? 20;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const log = opts.onLog ?? (() => undefined);
  const signal = opts.signal;
  const queue = new NotificationQueue();

  const checkAbort = () => {
    if (signal?.aborted) throw new DfuError('aborted', 'Update cancelled');
  };

  const expectResponse = async (op: OpCode, what: string, ms = timeoutMs) => {
    const d = await queue.wait((x) => x[0] === Op.Response && x[1] === op, ms, signal, what);
    const status = d[2];
    if (status !== 1) throw new DfuError('status', `${what} failed: ${STATUS_TEXT[status] ?? `status ${status}`}`);
  };

  const control = async (bytes: number[]) => {
    checkAbort();
    try {
      await transport.writeControl(new Uint8Array(bytes));
    } catch (err) {
      throw new DfuError('transport', `Control point write failed: ${errorMessage(err)}`);
    }
  };

  const packet = async (bytes: Uint8Array) => {
    try {
      await transport.writePacket(bytes);
    } catch (err) {
      throw new DfuError('transport', `Packet write failed: ${errorMessage(err)}`);
    }
  };

  await transport.startNotifications((v) => queue.push(v));

  // 1. Start DFU for an application image, then send the image sizes (SD, BL, APP).
  log(`Start DFU (application, ${firmware.length} bytes)`);
  await control([Op.StartDfu, IMAGE_APPLICATION]);
  await packet(new Uint8Array([...u32(0), ...u32(0), ...u32(firmware.length)]));
  // Erasing flash can take a while on large images.
  await expectResponse(Op.StartDfu, 'Start DFU', Math.max(timeoutMs, 30000));

  // 2. Init packet.
  log(`Send init packet (${initPacket.length} bytes)`);
  await control([Op.InitDfuParams, 0x00]);
  for (let i = 0; i < initPacket.length; i += packetSize) await packet(initPacket.subarray(i, i + packetSize));
  await control([Op.InitDfuParams, 0x01]);
  await expectResponse(Op.InitDfuParams, 'Init packet');

  // 3. Flow control.
  if (prn > 0) {
    log(`Packet receipt notification every ${prn} packets`);
    await control([Op.PacketReceiptNotifRequest, prn & 0xff, (prn >> 8) & 0xff]);
  }

  // 4. Firmware image.
  log('Send firmware image');
  await control([Op.ReceiveFirmwareImage]);
  queue.clearReceipts();
  let sent = 0;
  let packets = 0;
  opts.onProgress?.(0, firmware.length);
  while (sent < firmware.length) {
    checkAbort();
    const chunk = firmware.subarray(sent, sent + packetSize);
    await packet(chunk);
    sent += chunk.length;
    packets++;
    if (prn > 0 && packets % prn === 0 && sent < firmware.length) {
      const d = await queue.wait((x) => x[0] === Op.PacketReceiptNotif, timeoutMs, signal, 'packet receipt');
      const confirmed = new DataView(d.buffer).getUint32(1, true);
      if (confirmed !== sent) throw new DfuError('status', `Device confirmed ${confirmed} bytes, ${sent} were sent`);
    }
    opts.onProgress?.(sent, firmware.length);
  }
  await expectResponse(Op.ReceiveFirmwareImage, 'Firmware transfer');

  // 5. Validate and activate.
  log('Validate firmware');
  await control([Op.ValidateFirmware]);
  await expectResponse(Op.ValidateFirmware, 'Validation');

  log('Activate and reset');
  try {
    await transport.writeControl(new Uint8Array([Op.ActivateAndReset]));
  } catch {
    // The device may reset before acknowledging the write; that is expected.
  }
  log('Update complete');
}
