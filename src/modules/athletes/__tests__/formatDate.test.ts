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
});
