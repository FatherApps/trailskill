import { MIN_CARD_WIDTH, TWO_COLUMN_BASIS, TWO_COLUMN_SHARE, twoColumnWidth } from '../components/coachGrid';

describe('coachGrid', () => {
  it('has a single source for the two-column share: the flex basis is derived from it', () => {
    expect(TWO_COLUMN_BASIS).toBe(`${TWO_COLUMN_SHARE * 100}%`);
  });

  it('gives two columns when two cards of the share fit, and one column otherwise', () => {
    const gap = 16;
    const fits = 2 * MIN_CARD_WIDTH + gap;

    expect(twoColumnWidth(fits, gap)).toBe((fits - gap) / 2);
    expect(twoColumnWidth(fits - 1, gap)).toBeNull();
  });
});
