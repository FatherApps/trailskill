import type { Hundredths, Millis } from '../../../core/time';
import type { FamilyMeasurement } from '../data/familyMeasurements';
import { localDay } from './localDay';

/** The imported fields this module needs; the results-import module owns the full type. */
export type OfficialImport = {
  id: string;
  provider: string;
  stroke: string;
  distance: string;
  pool: string;
  hundredths: Hundredths | null;
  swumOn: string; // yyyy-mm-dd
};

export type OfficialValue =
  | { kind: 'imported'; hundredths: Hundredths; provider: string; importedId: string }
  | { kind: 'manual'; millis: Millis }
  | null;

/**
 * The official value of a guardian's measurement:
 * - training never has one, and its captured time stays as it is;
 * - a competition takes the imported official result of the same event (stroke, distance, pool) swum the same local day, which wins
 *   over a hand-typed official time; with several that day (heats and finals) the one closest to the hand-typed official time, if any, and otherwise to the captured time, is chosen;
 * - otherwise the hand-typed official time, if any.
 * With an official value the captured competition time is history, never official.
 */
export function officialValue(m: FamilyMeasurement, imports: readonly OfficialImport[]): OfficialValue {
  if (m.sessionType !== 'competition') return null;
  const day = localDay(m.capturedAt);
  const reference = m.officialMillis ?? m.millis;
  const candidates = imports.filter(
    (r): r is OfficialImport & { hundredths: Hundredths } =>
      r.hundredths !== null && r.swumOn === day && r.stroke === m.stroke && r.distance === m.distance && r.pool === m.pool,
  );
  if (candidates.length > 0) {
    const distance = (r: { hundredths: number }) => (reference === null ? 0 : Math.abs(r.hundredths * 10 - reference));
    const best = [...candidates].sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id))[0]!;
    return { kind: 'imported', hundredths: best.hundredths, provider: best.provider, importedId: best.id };
  }
  return m.officialMillis !== null ? { kind: 'manual', millis: m.officialMillis } : null;
}
