/**
 * Parses a Nordic DFU package (.zip produced by adafruit-nrfutil / nrfutil "legacy" format).
 *
 * Expected layout:
 *   manifest.json  {"manifest": {"application": {"bin_file": "...", "dat_file": "..."}}}
 *   <app>.bin      application image
 *   <app>.dat      init packet
 */
import { readZip } from '../util/zip.ts';
import { errorMessage } from '../util/errors.ts';

export interface DfuPackage {
  /** Application image. */
  firmware: Uint8Array;
  /** Init packet (.dat). */
  initPacket: Uint8Array;
  /** Raw manifest content for diagnostics. */
  manifest: unknown;
}

export class DfuPackageError extends Error {}

interface ManifestImage {
  bin_file?: string;
  dat_file?: string;
}

export async function parseDfuPackage(zip: Uint8Array): Promise<DfuPackage> {
  let files: Map<string, Uint8Array>;
  try {
    files = await readZip(zip);
  } catch (err) {
    throw new DfuPackageError(`Not a valid DFU package: ${errorMessage(err)}`);
  }
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) throw new DfuPackageError('manifest.json missing from DFU package');
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
    manifest?: { application?: ManifestImage; softdevice?: ManifestImage; bootloader?: ManifestImage; softdevice_bootloader?: ManifestImage };
  };
  const m = manifest.manifest;
  if (!m?.application) {
    throw new DfuPackageError('Only application updates are supported (no application image in package)');
  }
  const { bin_file, dat_file } = m.application;
  const firmware = bin_file ? files.get(bin_file) : undefined;
  const initPacket = dat_file ? files.get(dat_file) : undefined;
  if (!firmware || !initPacket) throw new DfuPackageError('Application .bin or .dat missing from DFU package');
  return { firmware, initPacket, manifest };
}
