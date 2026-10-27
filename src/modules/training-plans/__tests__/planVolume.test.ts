import { formatNumber } from '../components/formatNumber';
import { planSummary } from '../components/planVolume';

const block = (repetitions: number, distance: number) => ({ repetitions, distance });

// Rows read from the database are not checked at runtime: they can hold null, undefined or strings where the type says number.
const row = (repetitions: unknown, distance: unknown) => ({ repetitions, distance });
// The production type says number: this test feeds it what the database can hand over.
const summaryOfRows = (rows: { repetitions: unknown; distance: unknown }[]) => planSummary(rows as Parameters<typeof planSummary>[0]);

describe('planSummary', () => {
  it('keeps "metres · blocks" when every block adds metres', () => {
    expect(planSummary([block(1, 200), block(8, 50)])).toBe('600 m · 2 bloques');
    expect(planSummary([block(8, 250)])).toBe('2.000 m · 1 bloque');
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
    // 1.4e308 is small + medium: any total that kept the big block would be bigger or overflow, so this one proves the big block is the one left out.
    const expected = `${formatNumber(1.4e308)} m + 1 bloque sin distancia`;
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
  // formatNumber rounds to three decimals, so the metres shown are the same in any order.
  it('shows the same metres for fractional distances in any order', () => {
    expect(planSummary([block(1, 0.1), block(1, 0.2)])).toBe('0,3 m · 2 bloques');
    for (const blocks of [
      [block(1, 0.1), block(1, 0.2), block(1, 0.3)],
      [block(1, 0.3), block(1, 0.2), block(1, 0.1)],
      [block(1, 0.2), block(1, 0.3), block(1, 0.1)],
    ]) {
      expect(planSummary(blocks)).toBe('0,6 m · 3 bloques');
    }
  });

  it('leaves out only one of two blocks that overflow the total together', () => {
    expect(planSummary([block(1e154, 1e154), block(1e154, 1e154)])).toBe(`${formatNumber(1e308)} m + 1 bloque sin distancia`);
    expect(planSummary([block(8, 50), block(1e154, 1e154), block(1e154, 1e154), block(1, 200)])).toBe(
      `${formatNumber(1e308)} m + 1 bloque sin distancia`,
    );
  });

  // Blocks are added from the smallest, so each one is still bigger than the rounding step of the total when it is added: a counted block always enters the sum.
  // The final total is the sum rounded to a double: 600 m next to 1e308 is lost in that rounding, as in any double sum, and the block still counts as measured.
  it('counts a small block next to a huge total as measured, in any order', () => {
    const expected = `${formatNumber(1e308)} m · 2 bloques`;
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
});
