/**
 * Pure functions that turn GitHub releases into firmware options for a given board and role.
 * No I/O here, so everything is unit-testable.
 */
import type { Board, FirmwareOption, Platform, Release, Role, SourceConfig } from './types.ts';

/** Lowercase alphanumeric key used to compare board names across sources. */
export function boardKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Maps the role spelling found in a file name to a Role. */
export function normaliseRole(raw: string): Role | undefined {
  const r = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (r === 'repeater') return 'repeater';
  if (r === 'roomserver' || r === 'room') return 'room-server';
  return undefined;
}

/** File extension → platform. `.bin` is ESP32 OTA, `.zip` is a Nordic DFU package. */
export function platformForExt(ext: string): Platform | undefined {
  if (ext === 'zip') return 'nrf52';
  if (ext === 'bin') return 'esp32';
  return undefined;
}

export interface ParsedAsset {
  boardKey: string;
  role: Role;
  platform: Platform;
}

/** Maps a source-specific board name to a catalog board key (lowercase alphanumerics). */
export function resolveAlias(source: Pick<SourceConfig, 'boardAliases'>, name: string): string {
  const key = boardKey(name);
  for (const [alias, id] of Object.entries(source.boardAliases ?? {})) {
    if (boardKey(alias) === key) return boardKey(id);
  }
  return key;
}

/** Parses an asset file name with the source's pattern. Returns undefined if not an OTA image. */
export function parseAsset(source: SourceConfig, assetName: string): ParsedAsset | undefined {
  for (const ex of source.exclude ?? []) {
    if (new RegExp(ex, 'i').test(assetName)) return undefined;
  }
  const m = new RegExp(source.assetPattern, 'i').exec(assetName);
  const g = m?.groups;
  if (!g?.board || !g.role || !g.ext) return undefined;
  if (g.merged) return undefined; // full-flash images are never used for OTA
  const role = normaliseRole(g.role);
  const platform = platformForExt(g.ext.toLowerCase());
  if (!role || !platform) return undefined;
  if (!source.platforms.includes(platform)) return undefined;
  const requiredVariant = source.otaVariants?.[platform];
  if (requiredVariant && (g.variant ?? '').toLowerCase() !== requiredVariant.toLowerCase()) return undefined;
  const name = g.flavor ? `${g.board}_${g.flavor}` : g.board;
  return { boardKey: resolveAlias(source, name), role, platform };
}

/** Does this release belong to the role (for sources with per-role tags) and the source? */
export function releaseMatchesRole(source: SourceConfig, tag: string, role: Role): boolean {
  if (source.roleTags) {
    const re = source.roleTags[role];
    return re ? new RegExp(re, 'i').test(tag) : false;
  }
  return source.tagPattern ? new RegExp(source.tagPattern, 'i').test(tag) : true;
}

export function versionOf(source: SourceConfig, tag: string): string {
  if (!source.versionPattern) return tag;
  const m = new RegExp(source.versionPattern, 'i').exec(tag);
  return m?.groups?.version ?? tag;
}

/** Keys under which a board may appear in asset names. */
export function boardKeys(board: Board): Set<string> {
  return new Set([board.id, ...board.aliases.map(boardKey)]);
}

export interface FindOptions {
  includePrerelease?: boolean;
}

/**
 * Returns the firmware options of one source for a board and role, newest first.
 * At most one asset is picked per release.
 */
export function findFirmware(
  source: SourceConfig,
  releases: Release[],
  board: Board,
  role: Role,
  opts: FindOptions = {},
): FirmwareOption[] {
  const keys = boardKeys(board);
  const out: FirmwareOption[] = [];
  for (const rel of releases) {
    if (rel.draft) continue;
    if (rel.prerelease && !opts.includePrerelease) continue;
    if (!releaseMatchesRole(source, rel.tag, role)) continue;
    const asset = rel.assets.find((a) => {
      const p = parseAsset(source, a.name);
      return p !== undefined && p.role === role && p.platform === board.platform && keys.has(p.boardKey);
    });
    if (!asset) continue;
    out.push({
      key: `${source.id}/${rel.tag}/${asset.name}`,
      sourceId: source.id,
      repo: source.repo,
      tag: rel.tag,
      version: versionOf(source, rel.tag),
      releaseName: rel.name || rel.tag,
      publishedAt: rel.publishedAt,
      releaseUrl: rel.htmlUrl,
      notes: rel.body,
      prerelease: rel.prerelease,
      boardId: board.id,
      role,
      platform: board.platform,
      asset,
    });
  }
  return out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** Whether a source can in principle serve this board (platform support only). */
export function sourceSupportsPlatform(source: SourceConfig, platform: Platform): boolean {
  return source.platforms.includes(platform);
}

export type DeviceMatch = 'match' | 'mismatch' | 'unknown';

/**
 * Compares the name a node advertises in OTA mode with the selected board.
 * - match: the name is the board's `<BOARD>_OTA` name
 * - mismatch: the name belongs to other boards
 * - unknown: e.g. the bootloader ("AdaDFU"), which does not reveal the board
 */
export function matchBleName(boards: Board[], name: string, expected: string | undefined): { match: DeviceMatch; knownAs: string[] } {
  // The OTAFIX bootloader advertises "<BOARD>_DFU" for the app's "<BOARD>_OTA".
  const base = (n: string) => n.replace(/_(OTA|DFU)$/i, '').toLowerCase();
  const isNodeName = /_(OTA|DFU)$/i.test(name);
  const knownAs = isNodeName ? boards.filter((b) => b.bleOtaName && base(b.bleOtaName) === base(name)).map((b) => b.name) : [];
  if (expected && isNodeName && base(name) === base(expected)) return { match: 'match', knownAs };
  if (knownAs.length > 0) return { match: 'mismatch', knownAs };
  return { match: 'unknown', knownAs };
}

/**
 * Compares the board name an ESP32 node reports over WiFi (e.g. "Heltec V3", from
 * `getManufacturerName()`) with the selected board. These names are free text, so a
 * non-matching name only means "not verifiable", never a confirmed mismatch.
 */
export function matchWifiBoard(reported: string, board: Board): DeviceMatch {
  const r = boardKey(reported);
  if (!r) return 'unknown';
  const keys = [...boardKeys(board), boardKey(board.name)];
  return keys.some((k) => k === r || (r.length >= 4 && k.includes(r)) || (k.length >= 4 && r.includes(k))) ? 'match' : 'unknown';
}
