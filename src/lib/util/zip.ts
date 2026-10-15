/**
 * Minimal ZIP reader using the browser's native DecompressionStream ("deflate-raw").
 * Supports stored (0) and deflate (8) entries — enough for Nordic DFU packages.
 */

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  dataOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

export class ZipError extends Error {}

function findEocd(view: DataView): number {
  // The end-of-central-directory record is at most 22 + 65535 bytes from the end.
  const min = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new ZipError('Not a ZIP file');
}

export function listZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== CEN_SIG) throw new ZipError('Corrupt central directory');
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (view.getUint32(localOffset, true) !== LOC_SIG) throw new ZipError('Corrupt local header');
    const dataOffset = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    entries.push({ name, method, compressedSize, size, dataOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const raw = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.method === 0) return raw.slice();
  if (entry.method !== 8) throw new ZipError(`Unsupported compression method ${entry.method}`);
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  if (out.length !== entry.size) throw new ZipError(`Size mismatch in ${entry.name}`);
  return out;
}

/** Reads all entries into a map of file name → contents. */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const e of listZip(bytes)) {
    if (e.name.endsWith('/')) continue;
    files.set(e.name, await readEntry(bytes, e));
  }
  return files;
}
