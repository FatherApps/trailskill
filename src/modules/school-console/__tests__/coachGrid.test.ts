import { MIN_CARD_WIDTH, TWO_COLUMN_BASIS, twoColumnWidth } from '../components/coachGrid';

describe('coachGrid', () => {
  it('has a flex basis of 34 %, without floating-point noise', () => {
    expect(TWO_COLUMN_BASIS).toBe('34%');
  });

  it('gives two columns when two cards of the share fit, and one column otherwise', () => {
    const gap = 16;
    const fits = 2 * MIN_CARD_WIDTH + gap;

    expect(twoColumnWidth(fits, gap)).toBe((fits - gap) / 2);
    expect(twoColumnWidth(fits - 1, gap)).toBeNull();
  });
});
