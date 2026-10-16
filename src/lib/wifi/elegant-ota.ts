/**
 * ESP32 OTA over WiFi. After `start ota`, MeshCore's ESP32 firmware opens the open access point
 * "MeshCore-OTA" and serves AsyncElegantOTA (v2) on http://192.168.4.1:
 *
 *   GET  /update/identity  {"id":"<node name> (<board>)","hardware":"ESP32"}
 *   POST /update           multipart/form-data: field "MD5" (must come first), file "firmware"
 *                          → "OK" / "FAIL", then the node reboots
 *
 * This module holds the pure parts (identity parsing, multipart body) and the HTTP calls,
 * which go through the native HTTP plugin (no CORS / mixed-content limits).
 */
import { httpFetch } from '../net/http.ts';
import { errorMessage } from '../util/errors.ts';
import { buildUploadBody, parseIdentity, type NodeIdentity } from './ota-format.ts';

export { parseIdentity, buildUploadBody, type NodeIdentity };

export const OTA_HOST = 'http://192.168.4.1';
export const OTA_SSID = 'MeshCore-OTA';

function withTimeout(ms: number, outer?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  outer?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

export type ProbeResult = { ok: true; identity?: NodeIdentity } | { ok: false; error: string };

/**
 * Checks whether a node is reachable on its OTA access point. Returns the identity when the
 * node reports one; a node that only answers on "/" is still reported as reachable.
 */
export async function probeNode(timeoutMs = 4000): Promise<ProbeResult> {
  const t = withTimeout(timeoutMs);
  try {
    const res = await httpFetch(`${OTA_HOST}/update/identity`, { signal: t.signal });
    if (res.ok) {
      const identity = parseIdentity(await res.json().catch(() => undefined));
      return { ok: true, identity };
    }
    const home = await httpFetch(`${OTA_HOST}/`, { signal: t.signal });
    return home.ok ? { ok: true } : { ok: false, error: `HTTP ${home.status}` };
  } catch (err) {
    return { ok: false, error: (err as Error).name === 'AbortError' ? 'timeout' : errorMessage(err) };
  } finally {
    t.done();
  }
}

/** Uploads the image. Resolves when the node answered "OK" (it reboots right after). */
export async function uploadFirmware(firmware: Uint8Array, md5: string, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<void> {
  const boundary = `----AlpineOta${Math.random().toString(16).slice(2)}`;
  const body = buildUploadBody(firmware, md5, boundary);
  const t = withTimeout(opts.timeoutMs ?? 180000, opts.signal);
  try {
    const res = await httpFetch(`${OTA_HOST}/update`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: body as BodyInit,
      signal: t.signal,
    });
    const text = (await res.text().catch(() => '')).trim();
    if (!res.ok || text.toUpperCase() !== 'OK') {
      throw new Error(`Node answered HTTP ${res.status}${text ? `: ${text}` : ''}`);
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error(opts.signal?.aborted ? 'Update cancelled' : 'Upload timed out');
    throw err;
  } finally {
    t.done();
  }
}
