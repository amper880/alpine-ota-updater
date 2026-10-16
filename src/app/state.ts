/**
 * Application state and the actions that change it.
 */
import boardsJson from '../../catalog/boards.json';
import sourcesJson from '../../catalog/sources.json';
import type { Board, FirmwareOption, Role, SourceConfig } from '../lib/catalog/types.ts';
import { findFirmware, sourceSupportsPlatform } from '../lib/catalog/match.ts';
import { loadReleases } from '../lib/github/releases.ts';
import { DownloadError, downloadFirmware } from '../lib/cache/download.ts';
import { clearFirmware, deleteFirmware, listFirmware, requestPersistence, type CachedFirmwareMeta } from '../lib/cache/db.ts';
import { loadPref, savePref } from '../lib/util/storage.ts';
import { createStore } from './store.ts';

export const BOARDS = boardsJson.boards as Board[];
export const SOURCES = sourcesJson.sources as SourceConfig[];

export type Theme = 'system' | 'light' | 'dark';

export interface ReleaseState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  requestKey?: string;
  options: FirmwareOption[];
  error?: string;
  offlineSince?: string;
}

export interface DownloadState {
  received: number;
  total: number;
  error?: string;
}

import type { DeviceMatch } from '../lib/catalog/match.ts';
import type { DeviceKind, ScannedDevice } from '../lib/ble/candidates.ts';
import type { OtaKind } from '../lib/wifi/ota-format.ts';
import { errorMessage } from '../lib/util/errors.ts';
export type { DeviceMatch };

/** The node picked in step 4 (the BluetoothDevice object itself lives in app/flash.ts). */
export interface PickedDevice {
  id: string;
  name: string;
  match: DeviceMatch;
  /** Boards that advertise this OTA name (for mismatch messages). */
  knownAs: string[];
  /** Application in OTA mode, bootloader already in DFU mode, or an ESP32 on WiFi. */
  kind: DeviceKind | 'wifi';
  /** WiFi OTA server variant the node runs (ESP32 only). */
  ota?: OtaKind;
}

export interface ScanState {
  status: 'idle' | 'scanning';
  devices: ScannedDevice[];
  /** Show every Bluetooth device, not only nodes in update mode. */
  showAll: boolean;
  error?: string;
  errorDetail?: string;
}

export type FlashPhase = 'idle' | 'running' | 'done' | 'error' | 'cancelled';
export type FlashStage = 'preparing' | 'connecting' | 'entering-bootloader' | 'reconnecting' | 'transferring' | 'finishing' | 'uploading';

export interface FlashState {
  phase: FlashPhase;
  stage?: FlashStage;
  sent: number;
  total: number;
  startedAt?: number;
  error?: string;
  log: string[];
}

export const IDLE_FLASH: FlashState = { phase: 'idle', sent: 0, total: 0, log: [] };

export interface AppState {
  theme: Theme;
  locale: string;
  boardId?: string;
  role: Role;
  sourceId?: string;
  firmwareKey?: string;
  /** Step the user reopened explicitly; undefined = follow progress. */
  openStep?: number;
  boardQuery: string;
  releases: ReleaseState;
  cached: Record<string, CachedFirmwareMeta>;
  downloads: Record<string, DownloadState>;
  libraryOpen: boolean;
  device?: PickedDevice;
  scan: ScanState;
  flash: FlashState;
}

export const store = createStore<AppState>({
  theme: loadPref<Theme>('theme', 'system'),
  locale: loadPref<string>('locale', ''),
  boardId: loadPref<string | undefined>('board', undefined),
  role: loadPref<Role>('role', 'repeater'),
  sourceId: loadPref<string | undefined>('source', undefined),
  firmwareKey: undefined,
  openStep: undefined,
  boardQuery: '',
  releases: { status: 'idle', options: [] },
  cached: {},
  downloads: {},
  libraryOpen: false,
  device: undefined,
  scan: { status: 'idle', devices: [], showAll: false },
  flash: IDLE_FLASH,
});

export const boardById = (id?: string): Board | undefined => BOARDS.find((b) => b.id === id);
export const sourceById = (id?: string): SourceConfig | undefined => SOURCES.find((s) => s.id === id);

export function selectedBoard(): Board | undefined {
  return boardById(store.get().boardId);
}
export function selectedSource(): SourceConfig | undefined {
  return sourceById(store.get().sourceId);
}
export function selectedFirmware(): FirmwareOption | undefined {
  const s = store.get();
  return s.releases.options.find((o) => o.key === s.firmwareKey);
}

/** First step that still needs input (1-based). */
export function progressStep(s: AppState): number {
  if (!boardById(s.boardId)) return 1;
  if (!sourceById(s.sourceId)) return 2;
  if (!s.firmwareKey || !s.cached[s.firmwareKey]) return 3;
  if (!s.device) return 4;
  return 5;
}

export function openStep(s: AppState): number {
  return s.openStep ?? progressStep(s);
}

// ---------------------------------------------------------------- preferences

export function setTheme(theme: Theme): void {
  savePref('theme', theme);
  store.set({ theme });
}

export function setLocalePref(locale: string): void {
  savePref('locale', locale);
  store.set({ locale });
}

// ---------------------------------------------------------------- selection

export function reopenStep(step: number | undefined): void {
  store.set({ openStep: step });
}

export function selectBoard(id: string): void {
  const board = boardById(id);
  if (!board) return;
  savePref('board', id);
  const s = store.get();
  const src = sourceById(s.sourceId);
  const keepSource = src && sourceSupportsPlatform(src, board.platform);
  const role = board.roles.includes(s.role) ? s.role : board.roles[0] ?? 'repeater';
  store.set({
    boardId: id,
    role,
    sourceId: keepSource ? s.sourceId : undefined,
    firmwareKey: undefined,
    openStep: undefined,
    boardQuery: '',
    device: undefined,
    flash: IDLE_FLASH,
  });
  void refreshFirmwareList();
}

export function selectRole(role: Role): void {
  savePref('role', role);
  store.set({ role, firmwareKey: undefined, device: undefined, flash: IDLE_FLASH });
  void refreshFirmwareList();
}

export function selectSource(id: string): void {
  savePref('source', id);
  store.set({ sourceId: id, firmwareKey: undefined, openStep: undefined, device: undefined, flash: IDLE_FLASH });
  void refreshFirmwareList();
}

export function useFirmware(key: string): void {
  store.set({ firmwareKey: key, openStep: undefined, flash: IDLE_FLASH });
}

let listAbort: AbortController | undefined;

export async function refreshFirmwareList(force = false): Promise<void> {
  const s = store.get();
  const board = boardById(s.boardId);
  const source = sourceById(s.sourceId);
  if (!board || !source) {
    store.set({ releases: { status: 'idle', options: [] } });
    return;
  }
  const requestKey = `${source.id}|${board.id}|${s.role}`;
  listAbort?.abort();
  const ctrl = new AbortController();
  listAbort = ctrl;
  store.set({ releases: { status: 'loading', requestKey, options: [] } });
  try {
    const { releases, offlineSince } = await loadReleases(source.repo, { signal: ctrl.signal, force });
    if (ctrl.signal.aborted) return;
    const options = findFirmware(source, releases, board, s.role);
    store.set({ releases: { status: 'ok', requestKey, options, offlineSince } });
  } catch (err) {
    if (ctrl.signal.aborted) return;
    store.set({ releases: { status: 'error', requestKey, options: [], error: errorMessage(err) } });
  }
}

// ---------------------------------------------------------------- firmware library

const downloadAborts = new Map<string, AbortController>();

export async function refreshCached(): Promise<void> {
  try {
    const list = await listFirmware();
    store.set({ cached: Object.fromEntries(list.map((f) => [f.key, f])) });
  } catch {
    store.set({ cached: {} });
  }
}

export async function startDownload(fw: FirmwareOption): Promise<void> {
  if (downloadAborts.has(fw.key)) return;
  const ctrl = new AbortController();
  downloadAborts.set(fw.key, ctrl);
  const setDl = (d: DownloadState | undefined) =>
    store.set((s) => {
      const downloads = { ...s.downloads };
      if (d) downloads[fw.key] = d;
      else delete downloads[fw.key];
      return { downloads };
    });
  setDl({ received: 0, total: fw.asset.size });
  void requestPersistence();
  try {
    let last = 0;
    await downloadFirmware(
      fw,
      (received, total) => {
        const now = performance.now();
        if (now - last > 100 || received === total) {
          last = now;
          setDl({ received, total });
        }
      },
      ctrl.signal,
    );
    setDl(undefined);
    await refreshCached();
    store.set({ firmwareKey: fw.key, openStep: undefined });
  } catch (err) {
    const code = err instanceof DownloadError ? err.code : 'network';
    if (code === 'aborted') setDl(undefined);
    else setDl({ received: 0, total: fw.asset.size, error: code });
  } finally {
    downloadAborts.delete(fw.key);
  }
}

export function cancelDownload(key: string): void {
  downloadAborts.get(key)?.abort();
}

export function dismissDownloadError(key: string): void {
  store.set((s) => {
    const downloads = { ...s.downloads };
    delete downloads[key];
    return { downloads };
  });
}

export async function removeCached(key: string): Promise<void> {
  await deleteFirmware(key).catch(() => undefined);
  if (store.get().firmwareKey === key) store.set({ firmwareKey: undefined });
  await refreshCached();
}

export async function removeAllCached(): Promise<void> {
  await clearFirmware().catch(() => undefined);
  store.set({ firmwareKey: undefined });
  await refreshCached();
}

export function setLibraryOpen(open: boolean): void {
  store.set({ libraryOpen: open });
}
