/**
 * Checks a firmware file the user picked from disk before it is stored in the library.
 * Pure (bytes in, verdict out) so it is unit-testable.
 */
import type { Platform } from '../catalog/types.ts';
import { imageKind } from '../wifi/ota-format.ts';

export type LocalFileProblem = 'not-zip' | 'not-dfu' | 'not-bin' | 'merged' | 'not-ota-image' | 'empty';

/** ESP32 partition table magic, found at 0x8000 in merged (full-flash) images. */
const PARTITION_TABLE_OFFSET = 0x8000;

export function isMergedEsp32Image(bytes: Uint8Array): boolean {
  return bytes.length > PARTITION_TABLE_OFFSET + 1 && bytes[PARTITION_TABLE_OFFSET] === 0xaa && bytes[PARTITION_TABLE_OFFSET + 1] === 0x50;
}

/**
 * nRF52: a Nordic DFU package (.zip; its content is checked separately by parseDfuPackage).
 * ESP32: an OTA application image (.bin) — ESP-IDF app (MeshCore, PowerSaving) or MCUboot
 * (ZephCore "-update.bin"); full-flash "merged" images are refused, OTA cannot write them.
 */
export function checkLocalFile(name: string, bytes: Uint8Array, platform: Platform): LocalFileProblem | undefined {
  if (bytes.length === 0) return 'empty';
  if (platform === 'nrf52') {
    const zip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
    if (zip) return undefined;
    return /\.zip$/i.test(name) ? 'not-dfu' : 'not-zip';
  }
  if (!/\.bin$/i.test(name)) return 'not-bin';
  if (isMergedEsp32Image(bytes) || /merged/i.test(name)) return 'merged';
  if (imageKind(bytes) === 'unknown') return 'not-ota-image';
  return undefined;
}
