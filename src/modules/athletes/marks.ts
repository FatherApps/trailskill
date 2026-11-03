import { distances, strokes, type DistanceCode, type PoolCode, type StrokeCode } from '../../core/sport';
import type { EventAchievement } from './achievements';
import { byCapturedAt, personalBest, type PersonalBestResult } from './personalBest';

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
// A code outside the catalog ranks after every catalogued one, never first.
const rank = (catalog: readonly { code: string }[], code: string) => {
  const index = catalog.findIndex((entry) => entry.code === code);
  return index === -1 ? catalog.length : index;
};

/** The one order of events: catalog order by stroke, then by distance. Every list of marks sorts with it. */
export const compareEvents = (a: MarkEvent, b: MarkEvent) => rank(strokes, a.stroke) - rank(strokes, b.stroke) || rank(distances, a.distance) - rank(distances, b.distance);

/** The events listed in the pool even with no time. IM 100 is not swum in the long pool, so it shows there only with a mark. */
export function listedEvents(pool: PoolCode, marked: ReadonlySet<string> = new Set()): MarkEvent[] {
  return designEvents.filter((event) => pool !== 'LCM' || event.stroke !== 'IM' || marked.has(eventId(event)));
}

/** One row per listed event, then the other events with a mark in catalog order. Each best is the profile's own `personalBest`, over the measured and the imported results together. */
export function marksByEvent(measurements: readonly EventAchievement[], pool: PoolCode): MarkRow[] {
  const byEvent = new Map<string, EventAchievement[]>();
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
    .sort(compareEvents);

  return [...listed, ...others].map((event) => ({ id: eventId(event), ...event, best: bests.get(eventId(event)) ?? null }));
}

// `stroke` is a catalog code, or the code as it came for a stroke outside the catalog.
export type MarkSection = { stroke: string; rows: MarkRow[] };

/** The rows grouped by stroke, each stroke's events by distance. A stroke outside the catalog still gets its section, after the catalogued ones, so no row disappears. */
export function marksByStroke(rows: readonly MarkRow[]): MarkSection[] {
  const sections = new Map<string, MarkRow[]>();
  for (const row of [...rows].sort(compareEvents)) sections.set(row.stroke, [...(sections.get(row.stroke) ?? []), row]);
  return [...sections].map(([stroke, grouped]) => ({ stroke, rows: grouped }));
}

const asAchievement = (best: PersonalBestResult) => ({ ...best, capturedAt: best.date });

/** The row whose best was set most recently, by the same day-first order as the personal best (issue 204); null when no event has a time. */
export function featuredMark(rows: readonly MarkRow[]): MarkRow | null {
  return rows.reduce<MarkRow | null>((latest, row) => {
    if (!row.best) return latest;
    return !latest?.best || byCapturedAt(asAchievement(row.best), asAchievement(latest.best)) > 0 ? row : latest;
  }, null);
}
