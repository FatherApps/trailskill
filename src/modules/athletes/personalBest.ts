import type { Hundredths } from '../../core/time';
import type { MeasurementKind } from '../timing';
import { achievementDay, type Achievement } from './achievements';
import type { EventValue } from './components/EventSelector';
import type { HistoryOrigin } from './components/HistoryList';
import type { HistoryRepository } from './data/history';

/** Kinds whose time can be a personal best. The rule is confirmed in issue 204: an imported official result counts as a `race`. */
export const personalBestKinds: readonly MeasurementKind[] = ['race', 'repetition'];

export type PersonalBestResult = {
  id: string;
  hundredths: Hundredths;
  date: string; // capturedAt
  kind: MeasurementKind;
  origin: HistoryOrigin;
  // The organization behind an imported best, from data.
  sourceName?: string;
  // Previous best minus this one (positive: faster); null when there was no earlier valid time, never 0.
  improvement: { hundredths: Hundredths; previousDate: string } | null;
};

type Eligible = Achievement & { hundredths: Hundredths };

// By day first, so a measured time and an imported one (which has a date only) compare alike. Within a day the capture time
// orders two measured times; shortcut: a date-only result and a timestamped one on the same day go by id, with no preference for the source.
const hasTime = (capturedAt: string) => capturedAt.length > 10;
const byCapturedAt = (a: Eligible, b: Eligible) =>
  achievementDay(a.capturedAt).localeCompare(achievementDay(b.capturedAt)) ||
  (hasTime(a.capturedAt) && hasTime(b.capturedAt) ? a.capturedAt.localeCompare(b.capturedAt) : 0) ||
  a.id.localeCompare(b.id);

/** The athlete's fastest eligible time (the first one on a tie) and its improvement over the best before it. */
export function personalBest(measurements: readonly Achievement[]): PersonalBestResult | null {
  const eligible = measurements
    .filter((m): m is Eligible => m.hundredths !== null && personalBestKinds.includes(m.kind))
    .sort(byCapturedAt);

  // Only a strictly faster time replaces the best, so a tie keeps the first achievement.
  let best: Eligible | undefined;
  let previous: Eligible | undefined;
  for (const m of eligible) {
    if (!best || m.hundredths < best.hundredths) {
      previous = best;
      best = m;
    }
  }
  if (!best) return null;

  return {
    id: best.id,
    hundredths: best.hundredths,
    date: best.capturedAt,
    kind: best.kind,
    origin: best.origin,
    ...(best.sourceName ? { sourceName: best.sourceName } : {}),
    improvement: previous
      ? { hundredths: (previous.hundredths - best.hundredths) as Hundredths, previousDate: previous.capturedAt }
      : null,
  };
}

/** The athlete's best time in the event, read from the local history; null when there is none, never 0. */
export async function personalBestTime(history: HistoryRepository, athleteId: string, event: EventValue): Promise<Hundredths | null> {
  return personalBest(await history.listByEvent(athleteId, event))?.hundredths ?? null;
}
