import { formatDate, formatDateTime } from '../components/formatDate';

describe('formatDate', () => {
  it('formats a long date with the month from the translations', () => {
    expect(formatDate('2026-10-23', 'long')).toBe('23 de octubre de 2026');
    expect(formatDate('2024-02-29', 'long')).toBe('29 de febrero de 2024');
  });

  it('formats a short date', () => {
    expect(formatDate('2026-10-23', 'short')).toBe('23 oct 2026');
  });

  it.each(['2026-1-18', '2026-13-01', '2026-10-00', '2026-10-32', '2026-02-30', '2025-02-29', 'ayer', ''])(
    'returns null for %p instead of showing a wrong date',
    (value) => {
      expect(formatDate(value, 'long')).toBeNull();
    },
  );
});

describe('formatDateTime', () => {
  it('formats the short date and the 24-hour time of a local date-time', () => {
    expect(formatDateTime('2026-10-24T08:30')).toEqual({ date: '24 oct 2026', time: '08:30' });
    expect(formatDateTime('2026-10-24T23:59')).toEqual({ date: '24 oct 2026', time: '23:59' });
  });

  it.each(['2026-10-24', '2026-10-24T8:30', '2026-10-24T24:00', '2026-10-24T08:60', '2026-02-30T08:30', 'ayer', ''])(
    'returns null for %p instead of showing a wrong date or time',
    (value) => {
      expect(formatDateTime(value)).toBeNull();
    },
  );
});
