/**
 * Pure helpers for the ESP32 WiFi OTA servers (no I/O, unit-tested).
 *
 * Two servers exist, depending on the firmware the node currently runs:
 *
 * - MeshCore / PowerSaving (Arduino, AsyncElegantOTA v2), AP "MeshCore-OTA", 192.168.4.1:
 *     GET  /update/identity  {"id":"<node name> (<board>)","hardware":"ESP32"}
 *     POST /update           multipart/form-data: "MD5" first, then file "firmware"
 * - ZephCore (Zephyr + MCUboot), AP "ZephCore-OTA", 192.168.100.1:
 *     GET  /identity         {"name":"<node name>","board":"<board>"}
 *     POST /upload           raw image body (MCUboot-signed "-update.bin")
 *
 * Both answer "OK" and reboot after a successful upload.
 */

export type OtaKind = 'meshcore' | 'zephcore';

export interface OtaProfile {
  kind: OtaKind;
  /** Name shown to the user. */
  label: string;
  ssid: string;
  host: string;
  identityPath: string;
  uploadPath: string;
  /** Image format the server accepts. */
  image: ImageKind;
}

export type ImageKind = 'esp-app' | 'mcuboot' | 'unknown';

export const OTA_PROFILES: Record<OtaKind, OtaProfile> = {
  meshcore: {
    kind: 'meshcore',
    label: 'MeshCore',
    ssid: 'MeshCore-OTA',
    host: 'http://192.168.4.1',
    identityPath: '/update/identity',
    uploadPath: '/update',
    image: 'esp-app',
  },
  zephcore: {
    kind: 'zephcore',
    label: 'ZephCore',
    ssid: 'ZephCore-OTA',
    host: 'http://192.168.100.1',
    identityPath: '/identity',
    uploadPath: '/upload',
    image: 'mcuboot',
  },
};

export interface NodeIdentity {
  /** Display id, e.g. "Rooftop (Heltec V3)". */
  id: string;
  /** Node name part, e.g. "Rooftop". */
  name: string;
  /** Board part, e.g. "Heltec V3"; empty if unknown. */
  board: string;
}

/** Parses the identity JSON of either server. */
export function parseIdentity(kind: OtaKind, json: unknown): NodeIdentity | undefined {
  if (!json || typeof json !== 'object') return undefined;
  if (kind === 'zephcore') {
    const o = json as { name?: unknown; board?: unknown };
    if (typeof o.name !== 'string') return undefined;
    const board = typeof o.board === 'string' && o.board !== 'Unknown' ? o.board : '';
    return { id: board ? `${o.name} (${board})` : o.name, name: o.name, board };
  }
  const o = json as { id?: unknown };
  if (typeof o.id !== 'string') return undefined;
  const m = /^(.*)\s+\(([^()]*)\)\s*$/.exec(o.id);
  return { id: o.id, name: (m ? m[1] : o.id).trim(), board: m ? m[2].trim() : '' };
}

/** Recognises the image format from its first bytes. */
export function imageKind(image: Uint8Array): ImageKind {
  if (image.length >= 4 && new DataView(image.buffer, image.byteOffset, 4).getUint32(0, true) === 0x96f3b83d) return 'mcuboot';
  if (image.length > 0 && image[0] === 0xe9) return 'esp-app';
  return 'unknown';
}

/** Builds the multipart body ElegantOTA expects: MD5 first, then the firmware file. */
export function buildUploadBody(firmware: Uint8Array, md5: string, boundary: string): Uint8Array {
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="MD5"\r\n\r\n${md5}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="firmware"; filename="firmware.bin"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + firmware.length + tail.length);
  body.set(head, 0);
  body.set(firmware, head.length);
  body.set(tail, head.length + firmware.length);
  return body;
}
