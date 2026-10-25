import { parseTimeInput } from '../domain/timeInput';

describe('parseTimeInput', () => {
  it.each([
    ['35,20', 3520],
    ['35.20', 3520],
    ['35', 3500],
    ['35,2', 3520],
    ['1:05,30', 6530],
    ['0,05', 5],
    [' 35,20 ', 3520],
  ])('reads %s as %i hundredths', (text, value) => {
    expect(parseTimeInput(text)).toEqual({ ok: true, value });
  });

  it('reads an empty field as a missing time, never zero', () => {
    expect(parseTimeInput('')).toEqual({ ok: true, value: null });
    expect(parseTimeInput('   ')).toEqual({ ok: true, value: null });
  });

  it('keeps a typed zero as zero so the repository guard can refuse it', () => {
    expect(parseTimeInput('0,00')).toEqual({ ok: true, value: 0 });
  });

  it.each(['abc', '35,', '35,123', '1:75,00', '-5,00', '1:2:3', ',50'])('refuses %s', (text) => {
    expect(parseTimeInput(text)).toEqual({ ok: false });
  });
});
