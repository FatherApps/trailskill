import { ProviderUnavailableError } from '../../../port.ts';
import { MAX_LEF_BYTES, MAX_ZIP_BYTES, readSingleLef } from '../zip.ts';
import { buildZip, crc32 } from './zipBuilder.ts';

const bytes = (s: string) => new TextEncoder().encode(s);
const LEF = bytes('<LENEX version="3.0"><MEETS/></LENEX>');
const decode = (data: Uint8Array) => new TextDecoder().decode(data);

describe('readSingleLef', () => {
  it('allows 10 MB for the zip and 20 MB for the file', () => {
    expect(MAX_ZIP_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_LEF_BYTES).toBe(20 * 1024 * 1024);
  });

  it('reads a stored .lef', async () => {
    const zip = await buildZip([{ name: 'results.lef', data: LEF }]);
    expect(decode(await readSingleLef(zip))).toBe(decode(LEF));
  });

  it('reads a deflated .lef', async () => {
    const zip = await buildZip([{ name: 'results.lef', data: LEF, method: 8 }]);
    expect(decode(await readSingleLef(zip))).toBe(decode(LEF));
  });

  it('finds the single .lef among other entries and ignores their content', async () => {
    const zip = await buildZip([
      { name: 'results.pdf', data: bytes('%PDF'), method: 99, stored: bytes('x') },
      { name: 'folder/', data: new Uint8Array() },
      { name: 'folder/RESULTS.LEF', data: LEF },
    ]);
    expect(decode(await readSingleLef(zip))).toBe(decode(LEF));
  });

  it('trusts the central directory sizes, not the local header (data descriptor zips)', async () => {
    const zip = await buildZip([{ name: 'results.lef', data: LEF, method: 8 }]);
    // Zero the local header's crc and sizes, as a zip written with a data descriptor does.
    zip.fill(0, 14, 26);
    expect(decode(await readSingleLef(zip))).toBe(decode(LEF));
  });

  it('is unavailable when the CRC-32 does not match', async () => {
    const zip = await buildZip([{ name: 'results.lef', data: LEF, crc: crc32(LEF) ^ 1 }]);
    await expect(readSingleLef(zip)).rejects.toThrow(new ProviderUnavailableError('The tournament file is corrupt'));
  });

  it('is unavailable on zip64', async () => {
    const zip = await buildZip([{ name: 'results.lef', data: LEF }], { zip64Locator: true });
    await expect(readSingleLef(zip)).rejects.toThrow(new ProviderUnavailableError('The tournament file uses an unsupported zip format'));
  });

  it('is unavailable when an entry is encrypted', async () => {
    const zip = await buildZip([{ name: 'results.lef', data: LEF, flags: 1 }]);
    await expect(readSingleLef(zip)).rejects.toThrow(new ProviderUnavailableError('The tournament file uses an unsupported zip format'));
  });

  it('is unavailable on a method other than stored or deflate', async () => {
    const zip = await buildZip([{ name: 'results.lef', data: LEF, method: 12 }]);
    await expect(readSingleLef(zip)).rejects.toThrow(new ProviderUnavailableError('The tournament file uses an unsupported zip format'));
  });

  it('is unavailable without a .lef', async () => {
    const zip = await buildZip([{ name: 'results.pdf', data: LEF }]);
    await expect(readSingleLef(zip)).rejects.toThrow(new ProviderUnavailableError('The tournament file does not hold exactly one .lef'));
  });

  it('is unavailable with two .lef', async () => {
    const zip = await buildZip([
      { name: 'a.lef', data: LEF },
      { name: 'b.lef', data: LEF },
    ]);
    await expect(readSingleLef(zip)).rejects.toThrow(new ProviderUnavailableError('The tournament file does not hold exactly one .lef'));
  });

  it.each([
    ['not a zip', () => Promise.resolve(bytes('<html>404</html>'))],
    ['empty', () => Promise.resolve(new Uint8Array())],
    ['a comment that overruns the end', async () => {
      const zip = await buildZip([{ name: 'results.lef', data: LEF }]);
      zip[zip.length - 2] = 9; // comment length claims 9 bytes that are not there
      return zip;
    }],
    ['a central directory out of range', () => buildZip([{ name: 'results.lef', data: LEF }], { cdOffsetShift: 5000 })],
    ['an entry offset out of range', () => buildZip([{ name: 'results.lef', data: LEF }], { entryOffsetShift: 5000 })],
    ['a truncated zip', async () => (await buildZip([{ name: 'results.lef', data: LEF }])).subarray(0, 40)],
  ])('is unavailable on %s', async (_label, make) => {
    await expect(readSingleLef(await make())).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('is unavailable when the zip is over 10 MB, without reading it', async () => {
    await expect(readSingleLef(new Uint8Array(MAX_ZIP_BYTES + 1))).rejects.toThrow(new ProviderUnavailableError('The tournament file is too large'));
  });

  it('is unavailable when a .lef declares more than 20 MB', async () => {
    const zip = await buildZip([{ name: 'results.lef', data: LEF, declaredSize: MAX_LEF_BYTES + 1 }]);
    await expect(readSingleLef(zip)).rejects.toThrow(new ProviderUnavailableError('The tournament file is too large'));
  });

  it('cuts a zip bomb that expands past 20 MB while declaring less', async () => {
    const bomb = new Uint8Array(MAX_LEF_BYTES + 1024 * 1024); // zeros: a few KB deflated
    const zip = await buildZip([{ name: 'results.lef', data: bomb, method: 8, declaredSize: 100 }]);
    expect(zip.length).toBeLessThan(MAX_ZIP_BYTES);
    await expect(readSingleLef(zip)).rejects.toThrow(new ProviderUnavailableError('The tournament file is too large'));
  });

  it('cuts a zip bomb that declares its real size over 20 MB', async () => {
    const bomb = new Uint8Array(MAX_LEF_BYTES + 1024 * 1024);
    const zip = await buildZip([{ name: 'results.lef', data: bomb, method: 8 }]);
    await expect(readSingleLef(zip)).rejects.toThrow(new ProviderUnavailableError('The tournament file is too large'));
  });

  it('ignores the __MACOSX folder and the "._" files a Mac adds, so a zip made on macOS is read', async () => {
    const zip = await buildZip([
      { name: '__MACOSX/', data: new Uint8Array() },
      { name: '__MACOSX/._x.lef', data: bytes('appledouble') },
      { name: 'folder/._y.LEF', data: bytes('appledouble') },
      { name: 'x.lef', data: LEF, method: 8 },
    ]);
    expect(decode(await readSingleLef(zip))).toBe(decode(LEF));
  });

  it('still refuses two real .lef, even next to the files of a Mac', async () => {
    const zip = await buildZip([
      { name: '__MACOSX/._a.lef', data: bytes('appledouble') },
      { name: 'a.lef', data: LEF },
      { name: 'b.lef', data: LEF },
    ]);
    await expect(readSingleLef(zip)).rejects.toThrow(new ProviderUnavailableError('The tournament file does not hold exactly one .lef'));
  });

  it('does not take a name that only contains "._" or "__MACOSX" as a file of a Mac', async () => {
    const zip = await buildZip([
      { name: 'a._b.lef', data: LEF },
      { name: 'my__MACOSX/c.lef', data: LEF },
    ]);
    await expect(readSingleLef(zip)).rejects.toThrow(new ProviderUnavailableError('The tournament file does not hold exactly one .lef'));
  });
});
