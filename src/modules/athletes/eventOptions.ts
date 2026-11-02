import { distances, pools, strokes, type DistanceCode, type PoolCode, type StrokeCode } from '../../core/sport';
import type { EventValue } from './components/EventSelector';

type EventKey = { stroke: StrokeCode; distance: DistanceCode };

export type EventOptions = {
  // The events with results in the pool, by stroke and then by distance of the catalogs.
  events: EventKey[];
  // The pools that have results, in catalog order.
  pools: PoolCode[];
};

const position = (catalog: readonly { code: string }[], code: string) => catalog.findIndex((entry) => entry.code === code);

/** What the profile offers to choose: only the events and the pools the athlete has results in (measured and imported alike). */
export function eventOptions(results: readonly (EventKey & { pool: PoolCode })[], pool: PoolCode): EventOptions {
  const events = new Map<string, EventKey>();
  for (const { stroke, distance, pool: swumIn } of results) {
    if (swumIn === pool) events.set(`${stroke}|${distance}`, { stroke, distance });
  }
  return {
    events: [...events.values()].sort((a, b) => position(strokes, a.stroke) - position(strokes, b.stroke) || position(distances, a.distance) - position(distances, b.distance)),
    pools: pools.map((entry) => entry.code).filter((code) => results.some((r) => r.pool === code)),
  };
}

/** The event to show after a choice: the wanted one when it has results in its pool, else the first event of that pool. */
export function settleEvent(results: readonly (EventKey & { pool: PoolCode })[], wanted: EventValue): EventValue {
  const { events } = eventOptions(results, wanted.pool);
  if (events.some((e) => e.stroke === wanted.stroke && e.distance === wanted.distance)) return wanted;
  return events[0] ? { ...events[0], pool: wanted.pool } : wanted;
}
