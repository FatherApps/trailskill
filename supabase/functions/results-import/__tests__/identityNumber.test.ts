import { keyHasNumber, normalizeNumber } from '../identityNumber.ts';
import * as parse from '../providers/co-fecna/parse.ts';

describe('normalizeNumber', () => {
  it.each([
    ['1234567890', '1234567890'],
    ['123-4', '1234'],
    ['1.234.567', '1234567'],
    [' 1234 ', '1234'],
    ['ab1234', 'AB1234'],
  ])('%j becomes %j', (raw, expected) => {
    expect(normalizeNumber(raw)).toBe(expected);
  });
  it.each(['', '  ', '12/34', 'x'.repeat(21)])('rejects %j', (raw) => {
    expect(() => normalizeNumber(raw)).toThrow();
  });

  it('lives in one shared place: the federation parser no longer defines its own', () => {
    expect('normalizeNumber' in parse).toBe(false);
  });
});

describe('keyHasNumber', () => {
  const NUMBER = '1234567';

  it.each([
    ['the whole key', NUMBER],
    ['a segment', `20251018|1|${NUMBER}`],
    ['the first segment', `${NUMBER}|1|101`],
    ['a segment that is the number with dots', `t|e|1.234.567`],
    ['a segment that is the number with spaces and other case', 'x| 1 234 567 |y'],
  ])('is true when %s equals the number after normalizing', (_name, key) => {
    expect(keyHasNumber(key, NUMBER)).toBe(true);
  });

  it('compares the number normalized too', () => {
    expect(keyHasNumber('t|e|1234567', '1.234.567')).toBe(true);
    expect(keyHasNumber('t|e|ab12', ' AB-12 ')).toBe(true);
  });

  it.each([
    ['a longer id that contains the number', `r-${NUMBER}-1`],
    ['a segment that starts with the number', `t|${NUMBER}0|r`],
    ['a segment that ends with the number', `t|9${NUMBER}|r`],
    ['a key without the number', '20251018|1|101'],
    ['segments that only add up to the number', '123|4567'],
  ])('is false for %s', (_name, key) => {
    expect(keyHasNumber(key, NUMBER)).toBe(false);
  });

  it('ignores a segment that does not normalize (empty, too long, with other characters)', () => {
    expect(keyHasNumber(`||${'x'.repeat(21)}|a/b|${NUMBER}0`, NUMBER)).toBe(false);
  });

  it('fails closed when the number itself does not normalize', () => {
    expect(keyHasNumber('t|e|r', '')).toBe(true);
    expect(keyHasNumber('t|e|r', 'a/b')).toBe(true);
  });
});
