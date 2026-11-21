import { shareCodeFromQr } from '../domain/scannedCode';

describe('shareCodeFromQr', () => {
  it('takes a swimmer code as it is', () => {
    expect(shareCodeFromQr('TS-AAAAAA')).toBe('TS-AAAAAA');
    expect(shareCodeFromQr('TS-7K4Q2M')).toBe('TS-7K4Q2M');
  });

  it('forgives case and surrounding spaces, as the typed field does', () => {
    expect(shareCodeFromQr('  ts-7k4q2m\n')).toBe('TS-7K4Q2M');
  });

  it.each([
    ['a link', 'https://example.test/TS-AAAAAA'],
    ['a code with more in it', 'TS-AAAAAA extra'],
    ['a short code', 'TS-AAAAA'],
    ['a long code', 'TS-AAAAAAA'],
    ['characters the codes never use', 'TS-AAAAA0'],
    ['no prefix', 'AAAAAA'],
    ['another prefix', 'XX-AAAAAA'],
    ['empty text', ''],
  ])('refuses %s', (_name, data) => {
    expect(shareCodeFromQr(data)).toBeNull();
  });
});
