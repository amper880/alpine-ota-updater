/**
 * MeshCore → ZephCore switch with settings kept, using recrof/MCtoZC.
 *
 * MCtoZC is a one-shot nRF52840 firmware: sent over a running MeshCore repeater, it copies the
 * identity (_main.id), prefs, ACL and regions from MeshCore's littlefs v1 volume into the
 * volume ZephCore reads, verifies them, and restarts into the bootloader's BLE DFU mode. The
 * ZephCore repeater image is then sent as usual. One build per SoftDevice (v6: app at 0x26000,
 * v7: app at 0x27000); both carry an sd_req guard and are cached like other firmware.
 */
import { loadReleases } from '../lib/github/releases.ts';
import { DownloadError, downloadFirmware } from '../lib/cache/download.ts';
import { getFirmware } from '../lib/cache/db.ts';
import { parseDfuPackage } from '../lib/dfu/package.ts';
import { initPacketSdReq, type SoftDevice } from '../lib/dfu/uf2.ts';
import type { FirmwareOption, Release } from '../lib/catalog/types.ts';
import { UserError, toErrorInfo } from '../lib/util/errors.ts';
import { refreshCached, store } from './state.ts';
import { MIGRATOR_REPO, MIGRATOR_SOURCE, migratorAsset, pickMigratorRelease, sdMajor, type SdMajor } from '../lib/migrate/mctozc.ts';

export { migrationApplies } from '../lib/migrate/mctozc.ts';
export const MIGRATOR_URL = `https://github.com/${MIGRATOR_REPO}`;

function option(rel: Release, major: SdMajor): FirmwareOption {
  const asset = rel.assets.find((a) => a.name === migratorAsset(major))!;
  return {
    key: `${MIGRATOR_SOURCE}/${rel.tag}/${asset.name}`,
    sourceId: MIGRATOR_SOURCE,
    repo: MIGRATOR_REPO,
    tag: rel.tag,
    version: rel.tag.replace(/^v/, ''),
    releaseName: rel.name || rel.tag,
    publishedAt: rel.publishedAt,
    releaseUrl: rel.htmlUrl,
    notes: '',
    prerelease: false,
    boardId: '',
    role: 'repeater',
    platform: 'nrf52',
    asset,
  };
}

/** Turns the migration on or off; turning it on downloads both builds if needed. */
export async function setMigration(enabled: boolean): Promise<void> {
  store.set((s) => ({ migration: { ...s.migration, enabled } }));
  const s = store.get();
  // Also re-download when the builds were removed from the library meanwhile.
  const cached = Object.values(s.cached).some((c) => c.sourceId === MIGRATOR_SOURCE);
  if (enabled && s.migration.status !== 'loading' && (s.migration.status !== 'ready' || !cached)) await prepareMigrator();
}

export async function prepareMigrator(): Promise<void> {
  store.set((s) => ({ migration: { ...s.migration, status: 'loading', error: undefined } }));
  try {
    const { releases } = await loadReleases(MIGRATOR_REPO);
    const rel = pickMigratorRelease(releases);
    if (!rel) throw new UserError('err.migrate.notFound', 'No MCtoZC release with both SoftDevice builds');
    for (const major of [6, 7] as const) {
      const opt = option(rel, major);
      if (!store.get().cached[opt.key]) await downloadFirmware(opt, () => undefined);
    }
    await refreshCached();
    store.set((s) => ({ migration: { ...s.migration, status: 'ready', version: rel.tag } }));
  } catch (err) {
    const error =
      err instanceof DownloadError
        ? { key: 'err.migrate.download', detail: err.message }
        : toErrorInfo(err, 'err.migrate.download');
    store.set((s) => ({ migration: { ...s.migration, status: 'error', error } }));
  }
}

/** The cached migrator package for the node's SoftDevice (newest download). */
export async function migratorFor(sd: SoftDevice): Promise<{ name: string; firmware: Uint8Array; initPacket: Uint8Array }> {
  const name = migratorAsset(sdMajor(sd));
  const entry = Object.values(store.get().cached)
    .filter((c) => c.sourceId === MIGRATOR_SOURCE && c.assetName === name)
    .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt))[0];
  const fw = entry ? await getFirmware(entry.key) : undefined;
  if (!fw) throw new UserError('err.migrate.notFound', `${name} is not in the library`);
  const pkg = await parseDfuPackage(new Uint8Array(await fw.blob.arrayBuffer()));
  // The build's own guard must name this SoftDevice; never send the other one.
  if (!initPacketSdReq(pkg.initPacket).includes(sd.fwid)) {
    throw new UserError('err.dfu.softdevice', `${name} is not built for ${sd.name}`, { params: { image: name, node: sd.name } });
  }
  return { name: `${name} (${fw.tag})`, firmware: pkg.firmware, initPacket: pkg.initPacket };
}
