import { planSummary, planVolume } from '../components/planVolume';

const block = (repetitions: number, distance: number) => ({ repetitions, distance });

describe('planVolume', () => {
  it('adds repetitions × distance and counts the blocks that add no metres', () => {
    expect(planVolume([block(8, 50), block(4, 0), block(0, 100), block(1, 200)])).toEqual({ meters: 600, unmeasured: 2, count: 4 });
  });

  it('counts a NaN product as unmeasured and keeps it out of the total', () => {
    expect(planVolume([block(NaN, 50)])).toEqual({ meters: 0, unmeasured: 1, count: 1 });
    expect(planVolume([block(8, NaN)])).toEqual({ meters: 0, unmeasured: 1, count: 1 });
    expect(planVolume([block(8, 50), block(NaN, 100), block(1, 200)])).toEqual({ meters: 600, unmeasured: 1, count: 3 });
  });

  it('counts a negative product as unmeasured and never subtracts it from the total', () => {
    expect(planVolume([block(-2, 50)])).toEqual({ meters: 0, unmeasured: 1, count: 1 });
    expect(planVolume([block(4, -25)])).toEqual({ meters: 0, unmeasured: 1, count: 1 });
    expect(planVolume([block(8, 50), block(-2, 100), block(1, 200)])).toEqual({ meters: 600, unmeasured: 1, count: 3 });
  });

  it('keeps the total of the valid blocks when NaN and negative products come together', () => {
    expect(planVolume([block(8, 50), block(NaN, 100), block(-2, 50), block(4, 0), block(1, 200)])).toEqual({ meters: 600, unmeasured: 3, count: 5 });
  });
});

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

  it('never shows NaN or a lowered total for invalid blocks: they read as "sin distancia"', () => {
    expect(planSummary([block(8, 50), block(NaN, 100), block(-2, 50)])).toBe('400 m + 2 bloques sin distancia');
    expect(planSummary([block(NaN, 100), block(-2, 50)])).toBe('2 bloques');
  });

  it('has no summary without blocks', () => {
    expect(planSummary([])).toBeUndefined();
  });
});
