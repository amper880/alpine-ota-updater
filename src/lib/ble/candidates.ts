/**
 * Pure helpers for recognising nodes in update mode among scanned Bluetooth devices.
 */
import { DFU_SERVICE } from '../dfu/legacy-dfu.ts';

export interface ScannedDevice {
  address: string;
  name: string;
  rssi: number;
  services: string[];
}

export type DeviceKind = 'app-ota' | 'bootloader' | 'companion' | 'other';

/** Name the Adafruit bootloader advertises by default. */
export const BOOTLOADER_NAME = 'AdaDFU';

/** Prefix of the MeshCore Bluetooth companion's name ("MeshCore-<node name>"). */
export const COMPANION_PREFIX = 'MeshCore-';

/**
 * - app-ota:    MeshCore application after `start ota` ("<BOARD>_OTA")
 * - bootloader: Adafruit / OTAFIX bootloader in DFU mode ("AdaDFU", "<BOARD>_DFU", or the DFU
 *               service), or a vendor's factory bootloader ("<MODEL>-OTA", e.g. Heltec "HT-n5262G-OTA")
 * - companion:  MeshCore Bluetooth companion ("MeshCore-<name>"); it carries the buttonless DFU
 *               service, but only for paired (bonded) clients
 */
export function classify(d: Pick<ScannedDevice, 'name' | 'services'>): DeviceKind {
  const name = d.name ?? '';
  if (/_OTA$/i.test(name)) return 'app-ota';
  if (name.startsWith(BOOTLOADER_NAME) || /_DFU$/i.test(name) || /-OTA$/i.test(name)) return 'bootloader';
  if (name.startsWith(COMPANION_PREFIX)) return 'companion';
  if (d.services.some((s) => s.toLowerCase() === DFU_SERVICE)) return 'bootloader';
  return 'other';
}

/** "T114_OTA" / "T114_DFU" → "T114". */
export function baseName(name: string): string {
  return name.replace(/_(OTA|DFU)$/i, '');
}

/**
 * Chooses the bootloader to connect to after the node restarted into DFU mode.
 * Prefers the same address, then a "<BOARD>_DFU" name matching the node, then the strongest
 * bootloader signal. Returns undefined when nothing suitable is visible.
 */
export function pickBootloader(
  devices: ScannedDevice[],
  previous: { address: string; name: string; bootBase?: string },
): ScannedDevice | undefined {
  const boots = devices.filter((d) => classify(d) === 'bootloader');
  const same = boots.find((d) => d.address === previous.address);
  if (same) return same;
  // A companion's name ("MeshCore-…") says nothing about the board; use the selected board's.
  const bases = [baseName(previous.name), previous.bootBase].filter(Boolean).map((b) => b!.toLowerCase());
  const named = boots.find((d) => bases.includes(baseName(d.name).toLowerCase()));
  if (named) return named;
  return [...boots].sort((a, b) => b.rssi - a.rssi)[0];
}

/**
 * Whether a bootloader is a factory (non-OTAFIX) one. Its Bluetooth DFU is known to be
 * unreliable, so the update then uses small packets and frequent receipts.
 * - `firmwareRevision`: Device Information "Firmware Revision" of the bootloader, e.g.
 *   "0.6.2 s140 6.1.1" (factory) or "0.9.2-OTAFIX2.3-BP1.4 s140 6.1.1" (OTAFIX)
 * - without it, the advertised name decides: OTAFIX uses "<BOARD>_DFU"
 */
export function isFactoryBootloader(name: string, firmwareRevision?: string): boolean {
  if (firmwareRevision) return !/otafix/i.test(firmwareRevision);
  return !/_DFU$/i.test(name);
}
