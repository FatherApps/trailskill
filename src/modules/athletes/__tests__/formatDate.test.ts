import { formatDate } from '../components/formatDate';

describe('formatDate', () => {
  it('formats a short date', () => {
    expect(formatDate('2026-10-18', 'short')).toBe('18 oct 2026');
  });

  it('formats a long date', () => {
    expect(formatDate('2026-10-18', 'long')).toBe('18 de octubre de 2026');
  });

  it('returns null for a date without zero padding', () => {
    expect(formatDate('2026-1-18', 'short')).toBeNull();
  });

  it('returns null for a month out of range', () => {
    expect(formatDate('2026-13-01', 'short')).toBeNull();
  });

  it('returns null for a day zero', () => {
    expect(formatDate('2026-10-00', 'short')).toBeNull();
  });

  it('returns null for a day past the end of the month', () => {
    expect(formatDate('2026-10-32', 'short')).toBeNull();
  });

  it('returns null for February 30', () => {
    expect(formatDate('2026-02-30', 'short')).toBeNull();
  });

  it('formats February 29 in a leap year', () => {
    expect(formatDate('2024-02-29', 'long')).toBe('29 de febrero de 2024');
  });

  it('returns null for February 29 in a non-leap year', () => {
    expect(formatDate('2025-02-29', 'short')).toBeNull();
  });
});
