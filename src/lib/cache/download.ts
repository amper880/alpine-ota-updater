/**
 * Downloads a firmware file through the proxy, verifies it and stores it in IndexedDB.
 */
import type { FirmwareOption } from '../catalog/types.ts';
import { httpFetch } from '../net/http.ts';
import { isNativeApp } from '../platform.ts';
import { toHex } from '../util/format.ts';
import { putFirmware, type CachedFirmware } from './db.ts';

export type DownloadErrorCode = 'unsupported' | 'network' | 'http' | 'size' | 'checksum' | 'storage' | 'aborted';

export class DownloadError extends Error {
  readonly code: DownloadErrorCode;
  constructor(code: DownloadErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function assetUrl(fw: FirmwareOption): string {
  return `https://github.com/${fw.repo}/releases/download/${encodeURIComponent(fw.tag)}/${encodeURIComponent(fw.asset.name)}`;
}

export async function downloadFirmware(
  fw: FirmwareOption,
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal,
): Promise<CachedFirmware> {
  // Browsers block cross-origin release downloads (no CORS); only the app can download.
  if (!isNativeApp()) throw new DownloadError('unsupported', 'Downloads need the installed app');

  let res: Response;
  try {
    res = await httpFetch(assetUrl(fw), { signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new DownloadError('aborted', 'Download cancelled');
    throw new DownloadError('network', (err as Error).message);
  }
  if (!res.ok || !res.body) throw new DownloadError('http', `HTTP ${res.status}`);

  const total = fw.asset.size || Number(res.headers.get('Content-Length') ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      onProgress(received, total);
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new DownloadError('aborted', 'Download cancelled');
    throw new DownloadError('network', (err as Error).message);
  }

  if (fw.asset.size && received !== fw.asset.size) {
    throw new DownloadError('size', `Expected ${fw.asset.size} bytes, received ${received}`);
  }
  const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' });
  const sha256 = toHex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  const expected = fw.asset.digest?.startsWith('sha256:') ? fw.asset.digest.slice(7).toLowerCase() : undefined;
  if (expected && expected !== sha256) throw new DownloadError('checksum', 'SHA-256 mismatch');

  const record: CachedFirmware = {
    key: fw.key,
    sourceId: fw.sourceId,
    repo: fw.repo,
    tag: fw.tag,
    version: fw.version,
    boardId: fw.boardId,
    role: fw.role,
    platform: fw.platform,
    assetName: fw.asset.name,
    size: received,
    sha256,
    downloadedAt: new Date().toISOString(),
    blob,
  };
  try {
    await putFirmware(record);
  } catch (err) {
    throw new DownloadError('storage', (err as Error).message);
  }
  return record;
}
