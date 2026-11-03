// Builds synthetic zips for the tests: nothing here reads a real file.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export type EntrySpec = {
  name: string;
  /** The uncompressed content. */
  data: Uint8Array;
  method?: 0 | 8 | number;
  /** The bytes as stored in the archive; defaults to `data` (stored) or its deflate (method 8). */
  stored?: Uint8Array;
  flags?: number;
  crc?: number;
  /** Overrides what the central directory declares as the uncompressed size. */
  declaredSize?: number;
};

export type ZipOptions = { comment?: string; zip64Locator?: boolean; cdOffsetShift?: number; entryOffsetShift?: number };

const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const text = (s: string) => new TextEncoder().encode(s);

export async function buildZip(specs: EntrySpec[], options: ZipOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const parts: number[][] = [];
  const central: number[][] = [];
  let offset = 0;
  const push = (bytes: ArrayLike<number>) => {
    parts.push(Array.from(bytes));
    offset += bytes.length;
  };
  for (const spec of specs) {
    const method = spec.method ?? 0;
    const stored = spec.stored ?? (method === 8 ? await deflateRaw(spec.data) : spec.data);
    const crc = spec.crc ?? crc32(spec.data);
    const flags = spec.flags ?? 0;
    const name = text(spec.name);
    const start = offset;
    push([...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(method), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(stored.length), ...u32(spec.data.length), ...u16(name.length), ...u16(0), ...name]);
    push(stored);
    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(flags), ...u16(method), ...u16(0), ...u16(0x21), ...u32(crc),
      ...u32(stored.length), ...u32(spec.declaredSize ?? spec.data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(start + (options.entryOffsetShift ?? 0)), ...name,
    ]);
  }
  const cdStart = offset;
  for (const entry of central) push(entry);
  const cdSize = offset - cdStart;
  if (options.zip64Locator) push([...u32(0x07064b50), ...u32(0), ...u32(0), ...u32(0), ...u32(1)]);
  const comment = text(options.comment ?? '');
  push([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(specs.length), ...u16(specs.length), ...u32(cdSize), ...u32(cdStart + (options.cdOffsetShift ?? 0)), ...u16(comment.length), ...comment]);
  return Uint8Array.from(parts.flat());
}
