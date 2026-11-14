/**
 * Pure helpers for recrof/MCtoZC, the one-shot firmware that moves a MeshCore repeater's
 * identity and settings into ZephCore's storage before ZephCore is flashed.
 */
import type { Platform, Release, Role } from '../catalog/types.ts';
import type { SoftDevice } from '../dfu/uf2.ts';

export const MIGRATOR_SOURCE = 'mctozc';
export const MIGRATOR_REPO = 'recrof/MCtoZC';

export type SdMajor = 6 | 7;

/** Release asset of the migrator built for a SoftDevice major version. */
export const migratorAsset = (major: SdMajor): string => `MeshCore_to_ZephCore_SoftDevice_v${major}.zip`;

/** S140 6.1.1 → 6 (app at 0x26000), S140 7.3.0 → 7 (app at 0x27000). */
export const sdMajor = (sd: SoftDevice): SdMajor => (sd.appStart === 0x26000 ? 6 : 7);

/** Newest stable release that has both migrator builds (releases come newest first). */
export function pickMigratorRelease(releases: Release[]): Release | undefined {
  return releases.find(
    (r) => !r.draft && !r.prerelease && ([6, 7] as const).every((v) => r.assets.some((a) => a.name === migratorAsset(v))),
  );
}

/**
 * Whether the migration can be offered for a firmware file: a ZephCore repeater image for
 * nRF52 (MCtoZC only moves repeater data and only exists for the nRF52840).
 */
export function migrationApplies(fw: { sourceId: string; role: Role; platform: Platform }): boolean {
  return fw.sourceId === 'zephcore' && fw.role === 'repeater' && fw.platform === 'nrf52';
}
