/** Hardware platform; decides the update method. */
export type Platform = 'nrf52' | 'esp32';

/**
 * Firmware role. "companion" is the Bluetooth companion radio (companion_radio_ble); it is
 * only updatable over the air on nRF52 (ESP32 companion firmware has no OTA server).
 */
export type Role = 'repeater' | 'room-server' | 'companion';

export const ROLES: readonly Role[] = ['repeater', 'room-server', 'companion'];

/** One entry of catalog/boards.json. */
export interface Board {
  /** Normalised key: lowercase alphanumerics only, e.g. "rak4631". */
  id: string;
  name: string;
  vendor: string;
  platform: Platform;
  /** Spellings of the board name used in release asset file names. */
  aliases: string[];
  /** Roles the official MeshCore build publishes for this board (companion: nRF52 BLE only). */
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
  /**
   * Required value of the `variant` group per platform, e.g. `{ "esp32": "update" }` when only
   * "...-update.bin" files are OTA images.
   */
  otaVariants?: Partial<Record<Platform, string>>;
  /**
   * Board names used in this source's file names that differ from MeshCore's, mapped to board
   * ids of catalog/boards.json, e.g. `{ "heltec_wifi_lora32_v3": "heltecv3" }`.
   * A `flavor` group (e.g. "noscreen") is appended with "_" before the lookup.
   */
  boardAliases?: Record<string, string>;
  /** OTA server the firmware runs on ESP32 nodes ("meshcore" ElegantOTA or "zephcore"). */
  wifiOta?: 'meshcore' | 'zephcore';
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
