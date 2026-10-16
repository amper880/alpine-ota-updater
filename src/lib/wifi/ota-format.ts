/**
 * Pure helpers for the ESP32 ElegantOTA protocol (no I/O, unit-tested).
 */
export interface NodeIdentity {
  /** Full id string, e.g. "Rooftop (Heltec V3)". */
  id: string;
  /** Node name part, e.g. "Rooftop". */
  name: string;
  /** Board / manufacturer part, e.g. "Heltec V3"; empty if unknown. */
  board: string;
  hardware: string;
}

/** Parses the ElegantOTA identity JSON. */
export function parseIdentity(json: unknown): NodeIdentity | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const o = json as { id?: unknown; hardware?: unknown };
  if (typeof o.id !== 'string') return undefined;
  const m = /^(.*)\s+\(([^()]*)\)\s*$/.exec(o.id);
  return {
    id: o.id,
    name: (m ? m[1] : o.id).trim(),
    board: m ? m[2].trim() : '',
    hardware: typeof o.hardware === 'string' ? o.hardware : '',
  };
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
