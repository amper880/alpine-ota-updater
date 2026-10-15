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
  return { boardKey: boardKey(g.board), role, platform };
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
