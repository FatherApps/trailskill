import { eventOptions, settleEvent } from '../eventOptions';

// Synthetic: only the event of each result matters.
const results = [
  { stroke: 'BK', distance: '50m', pool: 'SCM' },
  { stroke: 'FR', distance: '100m', pool: 'SCM' },
  { stroke: 'FR', distance: '50m', pool: 'SCM' },
  { stroke: 'FR', distance: '50m', pool: 'SCM' },
  { stroke: 'BR', distance: '100m', pool: 'LCM' },
] as const;

describe('eventOptions', () => {
  it('lists once each event with results in the pool, by stroke and then by distance of the catalogs', () => {
    expect(eventOptions(results, 'SCM').events).toEqual([
      { stroke: 'FR', distance: '50m' },
      { stroke: 'FR', distance: '100m' },
      { stroke: 'BK', distance: '50m' },
    ]);
  });

  it('lists only the pools that have results, in catalog order', () => {
    expect(eventOptions(results, 'SCM').pools).toEqual(['SCM', 'LCM']);
    expect(eventOptions(results.filter((r) => r.pool === 'LCM'), 'LCM').pools).toEqual(['LCM']);
  });

  it('has nothing without results', () => {
    expect(eventOptions([], 'SCM')).toEqual({ events: [], pools: [] });
  });
});

describe('settleEvent', () => {
  it('keeps an event that has results in the pool', () => {
    expect(settleEvent(results, { stroke: 'BK', distance: '50m', pool: 'SCM' })).toEqual({ stroke: 'BK', distance: '50m', pool: 'SCM' });
  });

  it('moves to the first event of the pool when the event has no results there', () => {
    expect(settleEvent(results, { stroke: 'FR', distance: '50m', pool: 'LCM' })).toEqual({ stroke: 'BR', distance: '100m', pool: 'LCM' });
  });

  it('keeps the wanted event when the pool has no results at all', () => {
    expect(settleEvent([], { stroke: 'FR', distance: '50m', pool: 'SCM' })).toEqual({ stroke: 'FR', distance: '50m', pool: 'SCM' });
  });
});
