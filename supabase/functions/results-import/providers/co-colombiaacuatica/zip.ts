import { ProviderUnavailableError } from '../../port.ts';

// Against zip bombs: the maintainer's caps (#834).
export const MAX_ZIP_BYTES = 10 * 1024 * 1024;
export const MAX_LEF_BYTES = 20 * 1024 * 1024;

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const EOCD_SIZE = 22;
const CENTRAL_SIZE = 46;
const LOCAL_SIZE = 30;

const CORRUPT = 'The tournament file is corrupt';
const UNSUPPORTED = 'The tournament file uses an unsupported zip format';
const TOO_LARGE = 'The tournament file is too large';
const NOT_ONE_LEF = 'The tournament file does not hold exactly one .lef';

const fail = (message: string): never => {
  throw new ProviderUnavailableError(message);
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

type Entry = { name: string; flags: number; method: number; crc: number; compressedSize: number; size: number; offset: number };

// The end-of-central-directory record is the last 22 bytes plus a comment of at most 65535: its comment length must reach the end exactly.
function findEocd(view: DataView): number {
  const first = Math.max(0, view.byteLength - EOCD_SIZE - 0xffff);
  for (let at = view.byteLength - EOCD_SIZE; at >= first; at--) {
    if (view.getUint32(at, true) === EOCD && at + EOCD_SIZE + view.getUint16(at + 20, true) === view.byteLength) return at;
  }
  return fail(CORRUPT);
}

function readDirectory(view: DataView, zip: Uint8Array): { entries: Entry[]; directoryStart: number } {
  const eocd = findEocd(view);
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === ZIP64_LOCATOR) fail(UNSUPPORTED);
  const disk = view.getUint16(eocd + 4, true);
  const directoryDisk = view.getUint16(eocd + 6, true);
  const onDisk = view.getUint16(eocd + 8, true);
  const count = view.getUint16(eocd + 10, true);
  const size = view.getUint32(eocd + 12, true);
  const start = view.getUint32(eocd + 16, true);
  // 0xffff and 0xffffffff are the zip64 markers; a split archive is not one file.
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) fail(UNSUPPORTED);
  if (disk !== 0 || directoryDisk !== 0 || onDisk !== count) fail(UNSUPPORTED);
  if (start + size > eocd) fail(CORRUPT);

  const entries: Entry[] = [];
  let at = start;
  for (let index = 0; index < count; index++) {
    if (at + CENTRAL_SIZE > start + size || view.getUint32(at, true) !== CENTRAL) fail(CORRUPT);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const next = at + CENTRAL_SIZE + nameLength + extraLength + commentLength;
    if (next > start + size) fail(CORRUPT);
    const compressedSize = view.getUint32(at + 20, true);
    const entrySize = view.getUint32(at + 24, true);
    const offset = view.getUint32(at + 42, true);
    if (compressedSize === 0xffffffff || entrySize === 0xffffffff || offset === 0xffffffff) fail(UNSUPPORTED);
    entries.push({
      name: new TextDecoder().decode(zip.subarray(at + CENTRAL_SIZE, at + CENTRAL_SIZE + nameLength)),
      flags: view.getUint16(at + 8, true),
      method: view.getUint16(at + 10, true),
      crc: view.getUint32(at + 16, true),
      compressedSize,
      size: entrySize,
      offset,
    });
    at = next;
  }
  return { entries, directoryStart: start };
}

// Reads at most `limit` bytes of the inflated stream and stops there: nothing past it is ever held.
async function inflate(compressed: Uint8Array, limit: number): Promise<Uint8Array> {
  const reader = new Blob([new Uint8Array(compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return fail(TOO_LARGE);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ProviderUnavailableError) throw error;
    return fail(CORRUPT); // not valid deflate data
  }
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

/**
 * The content of the zip's only `.lef`, in memory. It reads the central directory, never the local headers, so the sizes
 * are trustworthy even when the zip uses data descriptors. Anything it cannot vouch for is "unavailable" with a clear message.
 */
export async function readSingleLef(zip: Uint8Array): Promise<Uint8Array> {
  if (zip.length > MAX_ZIP_BYTES) fail(TOO_LARGE);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  if (zip.length < EOCD_SIZE) fail(CORRUPT);
  const { entries, directoryStart } = readDirectory(view, zip);

  const lefs = entries.filter((entry) => entry.name.toLowerCase().endsWith('.lef'));
  if (lefs.length !== 1) fail(NOT_ONE_LEF);
  const entry = lefs[0];

  if ((entry.flags & 1) !== 0) fail(UNSUPPORTED); // encrypted
  if (entry.method !== 0 && entry.method !== 8) fail(UNSUPPORTED);
  if (entry.size > MAX_LEF_BYTES) fail(TOO_LARGE);

  if (entry.offset + LOCAL_SIZE > directoryStart || view.getUint32(entry.offset, true) !== LOCAL) fail(CORRUPT);
  const dataStart = entry.offset + LOCAL_SIZE + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > directoryStart) fail(CORRUPT);
  const stored = zip.subarray(dataStart, dataEnd);

  let content: Uint8Array;
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.size) fail(CORRUPT);
    content = stored;
  } else {
    // The declared size is a promise the stream must keep: more than that is a bomb that lied.
    content = await inflate(stored, Math.min(entry.size, MAX_LEF_BYTES));
  }
  if (content.length !== entry.size || crc32(content) !== entry.crc) fail(CORRUPT);
  return content;
}
