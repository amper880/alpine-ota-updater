/**
 * UF2 → Nordic legacy DFU conversion, so firmware published only as .uf2 (e.g. Cairn) can be
 * sent over Bluetooth, and SoftDevice checks shared by .zip and .uf2 packages.
 *
 * A UF2 file is a list of 512-byte blocks, each carrying up to 476 bytes for a flash address.
 * The application image is the contiguous range they cover (gaps filled with 0xFF). The init
 * packet is built like `adafruit-nrfutil dfu genpkg --dev-type 0x0052 --sd-req <id>`:
 *
 *   u16 device_type 0x0052 | u16 device_rev 0xFFFF | u32 app_version 0xFFFFFFFF |
 *   u16 sd_req count | u16 sd_req[] | u16 crc16(image)
 *
 * The SoftDevice id is derived from the image's start address (S140 6.1.1 apps start at
 * 0x26000, S140 7.3.0 apps at 0x27000), so the bootloader itself refuses an image built for
 * a different SoftDevice — verified against MeshCore's own .zip/.uf2 pairs.
 */
import type { DfuPackage } from './package.ts';

const MAGIC_START0 = 0x0a324655;
const MAGIC_START1 = 0x9e5d5157;
const MAGIC_END = 0x0ab16f30;
const FLAG_NOT_MAIN_FLASH = 0x00000001;
const FLAG_FAMILY_ID = 0x00002000;
/** nRF52840 application family. */
export const FAMILY_NRF52840 = 0xada52840;
/** Adafruit bootloader self-update family: never sent as an application. */
export const FAMILY_BOOTLOADER = 0xd663823c;
/** Start of the Adafruit bootloader on the nRF52840; an application must end before it. */
const BOOTLOADER_START = 0xf4000;

/** SoftDevices the app knows: application start address and nrfutil firmware id. */
export const SOFTDEVICES = [
  { name: 'S140 6.1.1', appStart: 0x26000, fwid: 0x00b6 },
  { name: 'S140 7.3.0', appStart: 0x27000, fwid: 0x0123 },
] as const;

export class Uf2Error extends Error {
  readonly code: 'not-uf2' | 'bootloader' | 'family' | 'layout' | 'softdevice';
  constructor(code: Uf2Error['code'], message: string) {
    super(message);
    this.name = 'Uf2Error';
    this.code = code;
  }
}

export function isUf2(bytes: Uint8Array): boolean {
  if (bytes.length < 512 || bytes.length % 512 !== 0) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, 8);
  return v.getUint32(0, true) === MAGIC_START0 && v.getUint32(4, true) === MAGIC_START1;
}

/** Reads the main-flash payload of a UF2 file as one image. */
export function parseUf2(bytes: Uint8Array): { start: number; image: Uint8Array } {
  if (!isUf2(bytes)) throw new Uf2Error('not-uf2', 'Not a UF2 file');
  const blocks: { addr: number; data: Uint8Array }[] = [];
  for (let off = 0; off < bytes.length; off += 512) {
    const v = new DataView(bytes.buffer, bytes.byteOffset + off, 512);
    if (v.getUint32(0, true) !== MAGIC_START0 || v.getUint32(4, true) !== MAGIC_START1 || v.getUint32(508, true) !== MAGIC_END) {
      throw new Uf2Error('not-uf2', `Broken UF2 block at offset ${off}`);
    }
    const flags = v.getUint32(8, true);
    if (flags & FLAG_NOT_MAIN_FLASH) continue;
    const addr = v.getUint32(12, true);
    const size = v.getUint32(16, true);
    if (size > 476) throw new Uf2Error('not-uf2', `UF2 block at offset ${off} is too large`);
    if (flags & FLAG_FAMILY_ID) {
      const family = v.getUint32(28, true);
      if (family === FAMILY_BOOTLOADER) throw new Uf2Error('bootloader', 'This UF2 updates the bootloader, not the firmware');
      if (family !== FAMILY_NRF52840) throw new Uf2Error('family', `UF2 family 0x${family.toString(16)} is not nRF52840`);
    }
    blocks.push({ addr, data: bytes.subarray(off + 32, off + 32 + size) });
  }
  if (blocks.length === 0) throw new Uf2Error('not-uf2', 'The UF2 file contains no firmware');
  const start = Math.min(...blocks.map((b) => b.addr));
  const end = Math.max(...blocks.map((b) => b.addr + b.data.length));
  if (end > BOOTLOADER_START) throw new Uf2Error('layout', `The image reaches 0x${end.toString(16)}, into the bootloader`);
  const image = new Uint8Array(end - start).fill(0xff);
  for (const b of blocks) image.set(b.data, b.addr - start);
  return { start, image };
}

/** CRC-16 as computed by the Nordic SDK (crc16_compute), used in the init packet. */
export function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of data) {
    crc = ((crc >> 8) | (crc << 8)) & 0xffff;
    crc ^= byte;
    crc ^= (crc & 0xff) >> 4;
    crc ^= (crc << 12) & 0xffff;
    crc ^= ((crc & 0xff) << 5) & 0xffff;
  }
  return crc;
}

export function buildInitPacket(image: Uint8Array, sdReq: number[]): Uint8Array {
  const out = new Uint8Array(12 + sdReq.length * 2);
  const v = new DataView(out.buffer);
  v.setUint16(0, 0x0052, true); // device type (Adafruit)
  v.setUint16(2, 0xffff, true); // device revision
  v.setUint32(4, 0xffffffff, true); // application version
  v.setUint16(8, sdReq.length, true);
  sdReq.forEach((id, i) => v.setUint16(10 + i * 2, id, true));
  v.setUint16(10 + sdReq.length * 2, crc16(image), true);
  return out;
}

/** Converts a UF2 file into the parts a legacy DFU transfer needs. */
export function uf2ToDfuPackage(bytes: Uint8Array): DfuPackage & { appStart: number; softDevice: string } {
  const { start, image } = parseUf2(bytes);
  const sd = SOFTDEVICES.find((s) => s.appStart === start);
  if (!sd) throw new Uf2Error('softdevice', `The image starts at 0x${start.toString(16)}, which matches no known SoftDevice`);
  return { firmware: image, initPacket: buildInitPacket(image, [sd.fwid]), manifest: { uf2: true, start }, appStart: start, softDevice: sd.name };
}

/** SoftDevice firmware ids an init packet accepts (0xFFFE = any). */
export function initPacketSdReq(initPacket: Uint8Array): number[] {
  if (initPacket.length < 10) return [];
  const v = new DataView(initPacket.buffer, initPacket.byteOffset, initPacket.byteLength);
  const n = v.getUint16(8, true);
  const out: number[] = [];
  for (let i = 0; i < n && 10 + i * 2 + 1 < initPacket.length; i++) out.push(v.getUint16(10 + i * 2, true));
  return out;
}

/**
 * SoftDevice of a bootloader from its Device Information firmware revision, e.g.
 * "0.9.2-OTAFIX2.3-BP1.4 s140 6.1.1". Undefined when not stated or unknown.
 */
export function softDeviceOfBootloader(firmwareRevision: string | undefined): (typeof SOFTDEVICES)[number] | undefined {
  const m = /s140[ _-]?(\d+\.\d+\.\d+)/i.exec(firmwareRevision ?? '');
  return m ? SOFTDEVICES.find((s) => s.name === `S140 ${m[1]}`) : undefined;
}
