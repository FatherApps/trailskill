import * as i18n from '../../../core/i18n';
import { planSummary } from '../components/planVolume';

// formatNumber has its own test. Here it is String, so the totals do not depend on the ICU data of Node, and they are not rounded: a different order of the sum changes the text.
jest.mock('../components/formatNumber', () => ({ formatNumber: (value: number) => String(value) }));

const block = (repetitions: number, distance: number) => ({ repetitions, distance });

// Rows read from the database are not checked at runtime: they can hold null, undefined or strings where the type says number.
const row = (repetitions: unknown, distance: unknown) => ({ repetitions, distance });
// The production type says number: this test feeds it what the database can hand over.
type Blocks = Parameters<typeof planSummary>[0];
const summaryOfRows = (rows: { repetitions: unknown; distance: unknown }[]) => {
  // The directive covers only the assignment below. Once planSummary accepts non-number factors, tsc reports it as unused ("Unused '@ts-expect-error' directive"): delete the directive and the Blocks alias, and pass rows straight to planSummary.
  // @ts-expect-error planSummary types both factors as number.
  const blocks: Blocks = rows;
  return planSummary(blocks);
};

// The totals are the plain String of the number (see the formatNumber mock): 1e308 is '1e+308'.
const HUGE = '1e+308';
const BIG = '1.4e+308';

// Every rotation of the plan, and the same rotations backwards.
const rotationsAndReverses = <T>(items: T[]): T[][] =>
  items.flatMap((_, i) => {
    const rotated = [...items.slice(i), ...items.slice(0, i)];
    return [rotated, [...rotated].reverse()];
  });

describe('summaryOfRows', () => {
  it('reads the rows through planSummary and shows their summary', () => {
    expect(summaryOfRows([row(8, 50)])).toBe('400 m · 1 bloque');
    expect(summaryOfRows([row(8, 50), row(null, 25)])).toBe('400 m + 1 bloque sin distancia');
  });
});

describe('planSummary', () => {
  it('keeps "metres · blocks" when every block adds metres', () => {
    expect(planSummary([block(1, 200), block(8, 50)])).toBe('600 m · 2 bloques');
    expect(planSummary([block(8, 250)])).toBe('2000 m · 1 bloque');
  });

  it('adds the blocks without distance next to the metres', () => {
    expect(planSummary([block(8, 50), block(4, 0)])).toBe('400 m + 1 bloque sin distancia');
    expect(planSummary([block(8, 50), block(4, 0), block(0, 25)])).toBe('400 m + 2 bloques sin distancia');
  });

  it('shows only the number of blocks, never "0 m", when no block adds metres', () => {
    expect(planSummary([block(4, 0), block(0, 50)])).toBe('2 bloques');
    expect(planSummary([block(4, 0)])).toBe('1 bloque');
  });

  it('adds repetitions × distance and counts the blocks that add no metres', () => {
    expect(planSummary([block(8, 50), block(4, 0), block(0, 100), block(1, 200)])).toBe('600 m + 2 bloques sin distancia');
  });

  it('counts a NaN product as without distance and keeps it out of the total', () => {
    expect(planSummary([block(NaN, 50)])).toBe('1 bloque');
    expect(planSummary([block(8, NaN)])).toBe('1 bloque');
    expect(planSummary([block(8, 50), block(NaN, 100), block(1, 200)])).toBe('600 m + 1 bloque sin distancia');
  });

  it('counts a negative product as without distance and never subtracts it from the total', () => {
    expect(planSummary([block(-2, 50)])).toBe('1 bloque');
    expect(planSummary([block(4, -25)])).toBe('1 bloque');
    expect(planSummary([block(8, 50), block(-2, 100), block(1, 200)])).toBe('600 m + 1 bloque sin distancia');
  });

  it('never shows NaN or a lowered total for invalid blocks: they read as "sin distancia"', () => {
    expect(planSummary([block(8, 50), block(NaN, 100), block(-2, 50)])).toBe('400 m + 2 bloques sin distancia');
    expect(planSummary([block(NaN, 100), block(-2, 50)])).toBe('2 bloques');
    expect(planSummary([block(8, 50), block(NaN, 100), block(-2, 50), block(4, 0), block(1, 200)])).toBe('600 m + 3 bloques sin distancia');
  });

  it('counts a block with two negative factors as without distance: the product is not what is checked', () => {
    expect(planSummary([block(-2, -25)])).toBe('1 bloque');
    expect(planSummary([block(8, 50), block(-2, -25), block(1, 200)])).toBe('600 m + 1 bloque sin distancia');
  });

  it('counts an Infinity factor as without distance and never shows "Infinity m"', () => {
    expect(planSummary([block(Infinity, 50)])).toBe('1 bloque');
    expect(planSummary([block(8, Infinity)])).toBe('1 bloque');
    expect(planSummary([block(-Infinity, -25)])).toBe('1 bloque');
    expect(planSummary([block(8, 50), block(Infinity, 100), block(1, 200)])).toBe('600 m + 1 bloque sin distancia');
    expect(planSummary([block(8, 50), block(Infinity, 100), block(-2, -25), block(NaN, 50)])).toBe('400 m + 3 bloques sin distancia');
  });

  it('counts two finite factors whose product overflows as without distance', () => {
    expect(planSummary([block(1e200, 1e200)])).toBe('1 bloque');
    expect(planSummary([block(8, 50), block(1e200, 1e200), block(1, 200)])).toBe('600 m + 1 bloque sin distancia');
  });

  it('counts a block whose product underflows to 0 as without distance and never adds a 0 m block to the total', () => {
    expect(planSummary([block(1e-200, 1e-200)])).toBe('1 bloque');
    expect(planSummary([block(8, 50), block(1e-200, 1e-200), block(1, 200)])).toBe('600 m + 1 bloque sin distancia');
  });

  it('drops the biggest block that would overflow the total, whatever the order of the blocks', () => {
    // 1.5e308 + 1e308 overflows; 4e307 + 1e308 does not. The same blocks give the same total and count in any order.
    const small = block(4e153, 1e154);
    const medium = block(1e154, 1e154);
    const big = block(1.5e154, 1e154);
    // 1.4e308 is small + medium: any total that kept the big block would be bigger or overflow.
    // The big block is left out directly: the two smaller ones alone give that same total and no unmeasured block, so the third block adds nothing to the metres.
    expect(planSummary([small, medium])).toBe(`${BIG} m · 2 bloques`);
    const expected = `${BIG} m + 1 bloque sin distancia`;
    for (const blocks of [
      [small, medium, big],
      [small, big, medium],
      [medium, small, big],
      [medium, big, small],
      [big, small, medium],
      [big, medium, small],
    ]) {
      expect(planSummary(blocks)).toBe(expected);
    }
  });

  // Blocks are added in ascending order, not in plan order: 0.1 + 0.2 + 0.3 is 0.6000000000000001 that way and 0.6 from the biggest.
  // The formatNumber mock does not round, so this test shows the unrounded total and fails if the order of the plan is used.
  it('shows the same metres for fractional distances in any order', () => {
    expect(planSummary([block(1, 0.1), block(1, 0.2)])).toBe('0.30000000000000004 m · 2 bloques');
    for (const blocks of [
      [block(1, 0.1), block(1, 0.2), block(1, 0.3)],
      [block(1, 0.3), block(1, 0.2), block(1, 0.1)],
      [block(1, 0.2), block(1, 0.3), block(1, 0.1)],
    ]) {
      expect(planSummary(blocks)).toBe('0.6000000000000001 m · 3 bloques');
    }
  });

  // 2^52 has a rounding step of 1: 2^52 + 0.4 rounds back to 2^52, but 0.4 + 0.4 first and then 2^52 gives 2^52 + 1. The two sums differ by 1.
  // The test assumes IEEE-754 doubles with round-to-nearest. No sum here is a tie (0.4 and 0.8 are not halves of the step), so how ties are broken (half-even) does not matter.
  it('adds fractional distances from the smallest, so the total does not depend on the order of the plan', () => {
    // If the engine rounds differently, these two lines fail first and say so, instead of the order check below failing with an unrelated total.
    expect(2 ** 52 + 0.4).toBe(2 ** 52);
    expect(0.4 + 0.4 + 2 ** 52).toBe(2 ** 52 + 1);
    const huge = block(1, 2 ** 52);
    const fraction = block(1, 0.4);
    const expected = '4503599627370497 m · 3 bloques';
    for (const blocks of [
      [huge, fraction, fraction],
      [fraction, huge, fraction],
      [fraction, fraction, huge],
    ]) {
      expect(planSummary(blocks)).toBe(expected);
    }
  });

  // NOT_MEASURED is 0, and that is observable: an underflow product is exactly 0 and must be skipped as the sentinel is, and the sort must give a consistent order (a NaN sentinel would break it).
  // Unmeasured blocks of every kind placed anywhere in the plan change neither the order of the measured ones nor the total, and each one is counted apart.
  it('keeps the blocks that are not measured out of the order and the sum, wherever they sit in the plan', () => {
    const unmeasured = [block(NaN, 5), block(-2, 5), block(1e-200, 1e-200), block(0, 50), block(1e200, 1e200)];
    const measured = [block(1, 200), block(8, 50), block(2, 25)];
    // Each unmeasured block alone is the only one counted apart, and each measured block alone is counted apart by none.
    for (const one of unmeasured) {
      expect(planSummary([one])).toBe('1 bloque');
      expect(planSummary([...measured, one])).toBe('650 m + 1 bloque sin distancia');
      expect(planSummary([one, ...measured])).toBe('650 m + 1 bloque sin distancia');
    }
    for (const one of measured) {
      expect(planSummary([one, unmeasured[0]])).toMatch(/ m \+ 1 bloque sin distancia$/);
      expect(planSummary([one])).toMatch(/ m · 1 bloque$/);
    }
    const all = [...unmeasured.slice(0, 2), measured[0], unmeasured[2], measured[1], unmeasured[3], measured[2], unmeasured[4]];
    for (const order of rotationsAndReverses(all)) {
      expect(planSummary(order)).toBe('650 m + 5 bloques sin distancia');
    }
  });

  // Same rotation with a sum that rounds differently by order (see the 2^52 test). Every unmeasured block here is decided by its factor (NaN, negative, 0, Infinity), never by how a product rounds.
  // If an unmeasured block were sorted among the others by a value that breaks the order (a NaN sentinel), the fractions would be added in another order and the total would be 2^52 instead of 2^52 + 1.
  it('keeps the total of a sum that depends on the order when unmeasured blocks sit between the measured ones', () => {
    const unmeasured = [block(NaN, 5), block(-2, 5), block(0, 50), block(8, Infinity), block(-2, -25)];
    const [huge, fraction] = [block(1, 2 ** 52), block(1, 0.4)];
    const all = [unmeasured[0], fraction, unmeasured[1], huge, unmeasured[2], unmeasured[3], fraction, unmeasured[4]];
    for (const order of rotationsAndReverses(all)) {
      expect(planSummary(order)).toBe('4503599627370497 m + 5 bloques sin distancia');
    }
  });

  it('leaves out only one of two blocks that overflow the total together', () => {
    expect(planSummary([block(1e154, 1e154), block(1e154, 1e154)])).toBe(`${HUGE} m + 1 bloque sin distancia`);
    expect(planSummary([block(8, 50), block(1e154, 1e154), block(1e154, 1e154), block(1, 200)])).toBe(`${HUGE} m + 1 bloque sin distancia`);
  });

  // Blocks are added from the smallest, so each one is still bigger than the rounding step of the total when it is added: a counted block always enters the sum.
  // The final total is the sum rounded to a double: 600 m next to 1e308 is lost in that rounding, as in any double sum, and the block still counts as measured.
  it('counts a small block next to a huge total as measured, in any order', () => {
    const expected = `${HUGE} m · 2 bloques`;
    expect(planSummary([block(1e154, 1e154), block(1, 600)])).toBe(expected);
    expect(planSummary([block(1, 600), block(1e154, 1e154)])).toBe(expected);
  });

  it('counts null, undefined and numeric strings (as PowerSync/SQLite may hand them over) as without distance', () => {
    expect(summaryOfRows([row(null, 50), row(8, null)])).toBe('2 bloques');
    expect(summaryOfRows([row(undefined, 50), row(8, undefined)])).toBe('2 bloques');
    expect(summaryOfRows([row('8', 50), row(8, '50')])).toBe('2 bloques');
    expect(summaryOfRows([block(8, 50), row('8', '50'), row(null, null), row(undefined, undefined)])).toBe('400 m + 3 bloques sin distancia');
  });

  it('has no summary without blocks', () => {
    expect(planSummary([])).toBeUndefined();
  });

  // The summary is one text: a second call to t would build it twice.
  describe('translations', () => {
    // The spy calls through to the real t. afterEach runs when an assertion fails too, so the spy never leaks into the next test.
    let tSpy: jest.SpyInstance;
    beforeEach(() => {
      tSpy = jest.spyOn(i18n, 't');
    });
    afterEach(() => tSpy.mockRestore());

    it.each([
      ['every block adds metres', [block(1, 200), block(8, 50)], 1],
      ['some blocks add no metres', [block(8, 50), block(4, 0)], 1],
      ['no block adds metres', [block(4, 0), block(0, 50)], 1],
      ['no blocks', [], 0],
    ])('asks for the text once per summary when %s', (_name, blocks, calls) => {
      planSummary(blocks);
      expect(tSpy).toHaveBeenCalledTimes(calls);
    });
  });
});
