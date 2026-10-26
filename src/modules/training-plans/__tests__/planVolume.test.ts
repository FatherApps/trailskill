import { planSummary } from '../components/planVolume';

const block = (repetitions: number, distance: number) => ({ repetitions, distance });

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

  it('has no summary without blocks', () => {
    expect(planSummary([])).toBeUndefined();
  });
});
