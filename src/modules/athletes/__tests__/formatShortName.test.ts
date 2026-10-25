import { formatShortName } from '../formatShortName';

describe('formatShortName', () => {
  it('shows the first name and the initial of the last name', () => {
    expect(formatShortName('Lucía', 'Rojas')).toBe('Lucía R.');
  });

  it('keeps a compound first name and takes the initial of the first surname', () => {
    expect(formatShortName('María José', 'Rojas Pérez')).toBe('María José R.');
  });

  it('shows only the first name when the last name is missing or blank', () => {
    expect(formatShortName('Lucía', '')).toBe('Lucía');
    expect(formatShortName('Lucía', '   ')).toBe('Lucía');
  });

  it('trims the names', () => {
    expect(formatShortName('  Lucía ', '  rojas ')).toBe('Lucía R.');
  });
});
