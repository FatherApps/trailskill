import type { Hundredths } from '../../core/time';
import type { MeasurementKind } from '../timing';
import type { HistoryMeasurement } from './data/history';
import type { HistoryOrigin } from './components/HistoryList';

/**
 * Kinds whose time can be a personal best.
 * PROVISIONAL, pending maintainer confirmation: https://github.com/FatherApps/trailskill/issues/57
 */
export const personalBestKinds: readonly MeasurementKind[] = ['race', 'repetition'];

export type PersonalBestResult = {
  id: string;
  hundredths: Hundredths;
  date: string; // capturedAt
  kind: MeasurementKind;
  origin: HistoryOrigin;
  // Previous best minus this one (positive: faster); null when there was no earlier valid time, never 0.
  improvement: { hundredths: Hundredths; previousDate: string } | null;
};

type Eligible = HistoryMeasurement & { hundredths: Hundredths };

const byCapturedAt = (a: Eligible, b: Eligible) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id);

/** The athlete's fastest eligible time (the first one on a tie) and its improvement over the best before it. */
export function personalBest(measurements: readonly HistoryMeasurement[]): PersonalBestResult | null {
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
    improvement: previous
      ? { hundredths: (previous.hundredths - best.hundredths) as Hundredths, previousDate: previous.capturedAt }
      : null,
  };
}
