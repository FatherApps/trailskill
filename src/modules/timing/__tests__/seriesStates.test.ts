import { assignHighlighted, highlightedPosition, reopen } from '../domain/series';
import { seriesFixture } from '../__fixtures__/series';

// The assignment rules live in the domain; these check them over the states the previews draw.
const { series, snapshots, times, athletes } = seriesFixture;
const withoutAthlete = (snapshot: typeof snapshots.none) => snapshot.filter((a) => a.athleteId === null).map((a) => a.position);

describe('series states drawn by the previews', () => {
  it('keeps the arrivals in order with their times in every state', () => {
    for (const snapshot of Object.values(snapshots)) {
      expect(snapshot.map((a) => a.position)).toEqual([1, 2, 3, 4]);
      expect(snapshot.map((a) => a.time)).toEqual(times);
    }
  });

  it('highlights the first position without an athlete, wherever the gaps are', () => {
    expect(highlightedPosition(series.none)).toBe(1);
    expect(highlightedPosition(series.partial)).toBe(3);
    expect(highlightedPosition(series.pending)).toBe(3);
    expect(highlightedPosition(series.all)).toBeNull();
    expect(highlightedPosition(reopen(series.all, 2))).toBe(2);
    expect(highlightedPosition(reopen(reopen(series.all, 4), 2))).toBe(2);
  });

  it('advances the highlight to the next position without an athlete after assigning', () => {
    const result = assignHighlighted(series.partial, athletes[2].id);

    expect(result.ok && highlightedPosition(result.series)).toBe(4);
  });

  it('reopening clears the name of that position and highlights it', () => {
    const reopened = reopen(series.all, 3);

    expect(withoutAthlete(snapshots.pending)).toEqual([3]);
    expect(highlightedPosition(reopened)).toBe(3);
  });

  it('keeps a position without a name in the list instead of dropping it', () => {
    expect(snapshots.pending).toHaveLength(4);
    expect(snapshots.none.every((a) => a.athleteId === null)).toBe(true);
    expect(snapshots.none).toHaveLength(4);
  });
});
