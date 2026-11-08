import { parseTimeEntry } from '../domain/timeEntry';

describe('parseTimeEntry', () => {
  it.each([
    ['42,71', 42_710],
    ['42.710', 42_710],
    ['1:05,372', 65_372],
    ['1:05,3', 65_300],
    ['59', 59_000],
  ])('reads %s', (text, value) => {
    expect(parseTimeEntry(text)).toEqual({ ok: true, value });
  });

  it.each(['', '0', '0,000', '1:65,00', 'abc', '42,7123'])('refuses %p', (text) => {
    expect(parseTimeEntry(text)).toEqual({ ok: false });
  });
});
