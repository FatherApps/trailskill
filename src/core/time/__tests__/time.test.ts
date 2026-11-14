import { formatMillis, formatTime, hundredthsFromNanos, millisFromNanos } from '../time';

describe('formatTime', () => {
  it('shows a dash for a missing time, never zero', () => {
    expect(formatTime(null)).toBe('—');
    expect(formatTime(undefined as unknown as null)).toBe('—');
    expect(formatTime(null)).not.toBe('0,00');
    expect(formatTime(undefined as unknown as null)).not.toBe('0,00');
  });

  it('formats a real zero as a time', () => {
    expect(formatTime(0)).toBe('0,00');
  });

  it('formats seconds and minutes', () => {
    expect(formatTime(3391)).toBe('33,91');
    expect(formatTime(7240)).toBe('1:12,40');
  });

  it('uses the requested decimal separator', () => {
    expect(formatTime(3391, { decimalSeparator: '.' })).toBe('33.91');
  });
});

describe('formatTime with alwaysShowMinutes', () => {
  it('keeps the minutes for times under a minute, the clock format', () => {
    expect(formatTime(0, { alwaysShowMinutes: true })).toBe('0:00,00');
    expect(formatTime(3391, { alwaysShowMinutes: true })).toBe('0:33,91');
    expect(formatTime(6123, { alwaysShowMinutes: true })).toBe('1:01,23');
  });

  it('still shows a dash for a missing time and honours the separator', () => {
    expect(formatTime(null, { alwaysShowMinutes: true })).toBe('—');
    expect(formatTime(3391, { alwaysShowMinutes: true, decimalSeparator: '.' })).toBe('0:33.91');
  });

  it('leaves the default output unchanged without the option', () => {
    expect(formatTime(0)).toBe('0,00');
    expect(formatTime(3391)).toBe('33,91');
    expect(formatTime(3391, { alwaysShowMinutes: false })).toBe('33,91');
  });
});

describe('hundredthsFromNanos', () => {
  it('truncates and never rounds up', () => {
    expect(hundredthsFromNanos(339_199_999_999n)).toBe(33919);
  });
});

describe('formatMillis', () => {
  it('shows thousandths when asked', () => {
    expect(formatMillis(65_372, { precision: 'thousandths' })).toBe('1:05,372');
    expect(formatMillis(9_005, { precision: 'thousandths' })).toBe('9,005');
  });

  it('truncates to hundredths by default, never rounding up', () => {
    expect(formatMillis(65_379)).toBe('1:05,37');
  });

  it('keeps a missing time as a dash', () => {
    expect(formatMillis(null, { precision: 'thousandths' })).toBe('—');
  });

  it('uses the chosen separator', () => {
    expect(formatMillis(42_710, { precision: 'thousandths', decimalSeparator: '.' })).toBe('42.710');
  });
});

describe('millisFromNanos', () => {
  it('truncates', () => {
    expect(millisFromNanos(1_999_999n)).toBe(1);
  });
});
