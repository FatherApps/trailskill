import { distances, strokes, type DistanceCode, type PoolCode, type StrokeCode } from '../../core/sport';
import type { HistoryMeasurement } from './data/history';
import { personalBest, type PersonalBestResult } from './personalBest';

export type MarkRow = { id: string; stroke: StrokeCode; distance: DistanceCode; best: PersonalBestResult | null };

type MarkEvent = { stroke: StrokeCode; distance: DistanceCode };

// The events the design lists for every athlete, in its order. Whether an event shows without a time is decided only here.
const designEvents: MarkEvent[] = [
  { stroke: 'FR', distance: '50m' },
  { stroke: 'FR', distance: '100m' },
  { stroke: 'BK', distance: '50m' },
  { stroke: 'BK', distance: '100m' },
  { stroke: 'BR', distance: '50m' },
  { stroke: 'FL', distance: '50m' },
  { stroke: 'IM', distance: '100m' },
];

const eventId = ({ stroke, distance }: MarkEvent) => `${stroke}-${distance}`;
const position = (catalog: readonly { code: string }[], code: string) => catalog.findIndex((entry) => entry.code === code);

/** The events listed in the pool even with no time. IM 100 is not swum in the long pool, so it shows there only with a mark. */
export function listedEvents(pool: PoolCode, marked: ReadonlySet<string> = new Set()): MarkEvent[] {
  return designEvents.filter((event) => pool !== 'LCM' || event.stroke !== 'IM' || marked.has(eventId(event)));
}

/** One row per listed event, then the other events with a mark in catalog order. Each best is the profile's own `personalBest`. */
export function marksByEvent(measurements: readonly HistoryMeasurement[], pool: PoolCode): MarkRow[] {
  const byEvent = new Map<string, HistoryMeasurement[]>();
  for (const m of measurements) {
    if (m.pool !== pool) continue;
    byEvent.set(eventId(m), [...(byEvent.get(eventId(m)) ?? []), m]);
  }
  const bests = new Map<string, PersonalBestResult>();
  for (const [id, list] of byEvent) {
    const best = personalBest(list);
    if (best) bests.set(id, best);
  }

  const listed = listedEvents(pool, new Set(bests.keys()));
  const listedIds = new Set(listed.map(eventId));
  const others = [...bests.keys()]
    .filter((id) => !listedIds.has(id))
    .map((id) => {
      const [stroke, distance] = id.split('-') as [StrokeCode, DistanceCode];
      return { stroke, distance };
    })
    .sort((a, b) => position(strokes, a.stroke) - position(strokes, b.stroke) || position(distances, a.distance) - position(distances, b.distance));

  return [...listed, ...others].map((event) => ({ id: eventId(event), ...event, best: bests.get(eventId(event)) ?? null }));
}
