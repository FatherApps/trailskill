import { formatNumber } from '../components/formatNumber';

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [800, '800'],
    [1250, '1.250'],
    [2000, '2.000'],
    [12.5, '12,5'],
    [1250.5, '1.250,5'],
    [1234567, '1.234.567'],
  ])('formats %p as %s in es-CO', (value, text) => {
    expect(formatNumber(value)).toBe(text);
  });
});
