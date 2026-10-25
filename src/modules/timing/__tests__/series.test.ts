import {
  arrivals,
  assignHighlighted,
  highlightedPosition,
  nextSeries,
  press,
  readySeries,
  reopen,
  type Series,
  undoLastArrival,
  unassignedPositions,
} from '../domain/series';

const s = (seconds: number) => BigInt(Math.round(seconds * 1e9));

// Synthetic athlete ids.
const ANA = 'athlete-a';
const BEA = 'athlete-b';
const CAM = 'athlete-c';

function withArrivals(...seconds: number[]): Series {
  return seconds.reduce((series, at) => press(series, s(at)), press(readySeries, s(0)));
}

function assign(series: Series, athleteId: string): Series {
  const result = assignHighlighted(series, athleteId);
  if (!result.ok) throw new Error(result.reason);
  return result.series;
}

describe('one-button series', () => {
  it('starts on the first press and records ordered arrivals with their time', () => {
    const series = withArrivals(31.2, 32.05, 35.999);
    expect(arrivals(series)).toEqual([
      { position: 1, time: 3120, athleteId: null },
      { position: 2, time: 3205, athleteId: null },
      { position: 3, time: 3599, athleteId: null },
    ]);
  });

  it('has no arrivals before the start', () => {
    expect(arrivals(readySeries)).toEqual([]);
  });

  it('ignores an arrival mark earlier than the last mark', () => {
    const series = withArrivals(30);
    expect(press(series, s(29))).toBe(series);
  });

  it('undo last removes only the last arrival', () => {
    const series = undoLastArrival(withArrivals(30, 31, 32));
    expect(arrivals(series).map((a) => a.time)).toEqual([3000, 3100]);
  });

  it('undo last is idempotent on an empty series', () => {
    const started = press(readySeries, s(0));
    expect(undoLastArrival(started)).toBe(started);
    expect(undoLastArrival(readySeries)).toBe(readySeries);
  });

  it('undo last also drops the assignment of the removed arrival', () => {
    let series = withArrivals(30, 31);
    series = assign(assign(series, ANA), BEA);
    series = undoLastArrival(series);
    expect(arrivals(series)).toEqual([{ position: 1, time: 3000, athleteId: ANA }]);
  });

  it('is ready for the next series', () => {
    expect(nextSeries()).toEqual(readySeries);
    expect(arrivals(nextSeries())).toEqual([]);
  });
});

describe('arrival assignment', () => {
  it('highlights the next position without a name and advances after assigning', () => {
    let series = withArrivals(30, 31, 32);
    expect(highlightedPosition(series)).toBe(1);
    series = assign(series, ANA);
    expect(highlightedPosition(series)).toBe(2);
    series = assign(series, BEA);
    expect(highlightedPosition(series)).toBe(3);
    series = assign(series, CAM);
    expect(highlightedPosition(series)).toBeNull();
  });

  it('reopens a position so it can be reassigned', () => {
    let series = assign(assign(withArrivals(30, 31), ANA), BEA);
    series = reopen(series, 1);
    expect(highlightedPosition(series)).toBe(1);
    series = assign(series, CAM);
    expect(arrivals(series).map((a) => a.athleteId)).toEqual([CAM, BEA]);
  });

  it('keeps every arrival never assigned as to be assigned', () => {
    const series = assign(withArrivals(30, 31, 32), ANA);
    expect(unassignedPositions(series)).toEqual([2, 3]);
    expect(arrivals(series)[2].athleteId).toBeNull();
  });

  it('rejects an athlete already assigned in the same series and says where', () => {
    const series = assign(withArrivals(30, 31), ANA);
    expect(assignHighlighted(series, ANA)).toEqual({ ok: false, reason: 'athlete_already_assigned', position: 1 });
  });

  it('accepts the athlete again after their position is reopened', () => {
    let series = assign(withArrivals(30, 31), ANA);
    series = reopen(series, 1);
    expect(assignHighlighted(series, ANA).ok).toBe(true);
  });

  it('rejects an assignment when no position is open', () => {
    expect(assignHighlighted(readySeries, ANA)).toEqual({ ok: false, reason: 'no_open_position' });
    expect(assignHighlighted(assign(withArrivals(30), ANA), BEA)).toEqual({ ok: false, reason: 'no_open_position' });
  });

  it('returns the same state when reopening a position that does not exist or is already open', () => {
    const series = withArrivals(30);
    expect(reopen(series, 1)).toBe(series);
    expect(reopen(series, 2)).toBe(series);
    expect(reopen(readySeries, 1)).toBe(readySeries);
  });
});
