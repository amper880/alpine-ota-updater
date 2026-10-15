/** Hardware platform; decides the update method. */
export type Platform = 'nrf52' | 'esp32';

/** Firmware role published for repeater-type nodes. */
export type Role = 'repeater' | 'room-server';

export const ROLES: readonly Role[] = ['repeater', 'room-server'];

/** One entry of catalog/boards.json. */
export interface Board {
  /** Normalised key: lowercase alphanumerics only, e.g. "rak4631". */
  id: string;
  name: string;
  vendor: string;
  platform: Platform;
  /** Spellings of the board name used in release asset file names. */
  aliases: string[];
  /** Roles the official MeshCore build publishes for this board. */
  roles: Role[];
  /** BLE name advertised after `start ota` (nRF52 only). */
  bleOtaName?: string;
}

/** One entry of catalog/sources.json. */
export interface SourceConfig {
  id: string;
  name: string;
  description?: string;
  /** GitHub "owner/name". */
  repo: string;
  homepage?: string;
  /** Regex a release tag must match (for sources with one tag per release). */
  tagPattern?: string;
  /** Per-role tag regexes (for sources that publish one release per role). */
  roleTags?: Partial<Record<Role, string>>;
  /** Regex with a named group `version`, applied to the tag. */
  versionPattern?: string;
  /** Regex with named groups `board`, `role`, `ext` and optionally `merged`, `variant`. */
  assetPattern: string;
  /** Substrings / regexes; matching asset names are ignored. */
  exclude?: string[];
  /** Platforms whose OTA images from this source are supported. */
  platforms: Platform[];
  notes?: string;
}

/** Release asset as returned by the GitHub API (trimmed). */
export interface ReleaseAsset {
  name: string;
  size: number;
  /** "sha256:<hex>" when GitHub provides it. */
  digest?: string | null;
}

/** Release as returned by the GitHub API (trimmed). */
export interface Release {
  tag: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
  draft: boolean;
  body: string;
  htmlUrl: string;
  assets: ReleaseAsset[];
}

/** A concrete firmware file the user can pick for a board + role. */
export interface FirmwareOption {
  /** Stable cache key: "<sourceId>/<tag>/<assetName>". */
  key: string;
  sourceId: string;
  repo: string;
  tag: string;
  version: string;
  releaseName: string;
  publishedAt: string;
  releaseUrl: string;
  notes: string;
  prerelease: boolean;
  boardId: string;
  role: Role;
  platform: Platform;
  asset: ReleaseAsset;
}
