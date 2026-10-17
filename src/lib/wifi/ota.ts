/**
 * ESP32 OTA over the node's own WiFi access point. See ota-format.ts for the two server
 * variants. Requests go through the native HTTP plugin (no CORS / mixed-content limits).
 */
import { httpFetch } from '../net/http.ts';
import { UserError, errorMessage } from '../util/errors.ts';
import { md5Hex } from '../util/md5.ts';
import { OTA_PROFILES, buildUploadBody, parseIdentity, type NodeIdentity, type OtaProfile } from './ota-format.ts';

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

export type ProbeResult = { ok: true; profile: OtaProfile; identity?: NodeIdentity } | { ok: false; error: string };

async function probeProfile(profile: OtaProfile, timeoutMs: number): Promise<ProbeResult> {
  const t = withTimeout(timeoutMs);
  try {
    const res = await httpFetch(`${profile.host}${profile.identityPath}`, { signal: t.signal });
    if (res.ok) {
      const identity = parseIdentity(profile.kind, await res.json().catch(() => undefined));
      return { ok: true, profile, identity };
    }
    const home = await httpFetch(`${profile.host}/`, { signal: t.signal });
    return home.ok ? { ok: true, profile } : { ok: false, error: `${profile.host}: HTTP ${home.status}` };
  } catch (err) {
    return { ok: false, error: `${profile.host}: ${(err as Error).name === 'AbortError' ? 'timeout' : errorMessage(err)}` };
  } finally {
    t.done();
  }
}

/**
 * Looks for a node on both OTA addresses at once (MeshCore 192.168.4.1, ZephCore
 * 192.168.100.1). The first one that answers wins.
 */
export async function probeNode(timeoutMs = 4000): Promise<ProbeResult> {
  const results = Object.values(OTA_PROFILES).map((p) => probeProfile(p, timeoutMs));
  const winner = await new Promise<ProbeResult | undefined>((resolve) => {
    let pending = results.length;
    for (const r of results) {
      void r.then((res) => {
        if (res.ok) resolve(res);
        else if (--pending === 0) resolve(undefined);
      });
    }
  });
  if (winner) return winner;
  const errors = (await Promise.all(results)).map((r) => (r.ok ? '' : r.error)).filter(Boolean);
  return { ok: false, error: errors.join('; ') };
}

/** Uploads the image. Resolves when the node answered "OK" (it reboots right after). */
export async function uploadFirmware(
  profile: OtaProfile,
  image: Uint8Array,
  opts: { signal?: AbortSignal; timeoutMs?: number; onLog?: (m: string) => void } = {},
): Promise<void> {
  let body: Uint8Array;
  let contentType: string;
  if (profile.kind === 'meshcore') {
    const md5 = md5Hex(image);
    opts.onLog?.(`MD5 ${md5}`);
    const boundary = `----AlpineOta${Math.random().toString(16).slice(2)}`;
    body = buildUploadBody(image, md5, boundary);
    contentType = `multipart/form-data; boundary=${boundary}`;
  } else {
    body = image;
    contentType = 'application/octet-stream';
  }
  const url = `${profile.host}${profile.uploadPath}`;
  opts.onLog?.(`POST ${url} (${body.length} bytes)`);
  const t = withTimeout(opts.timeoutMs ?? 300000, opts.signal);
  try {
    const res = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: body as BodyInit,
      signal: t.signal,
    });
    const text = (await res.text().catch(() => '')).trim();
    if (!res.ok || text.toUpperCase() !== 'OK') {
      throw new UserError('err.wifi.rejected', `Node answered HTTP ${res.status}${text ? `: ${text}` : ''}`, {
        params: { status: res.status },
        detail: text || undefined,
      });
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw opts.signal?.aborted
        ? new UserError('err.cancelled', 'Update cancelled')
        : new UserError('err.wifi.uploadTimeout', 'Upload timed out');
    }
    throw err;
  } finally {
    t.done();
  }
}
