import type { DistanceCode, PoolCode, StrokeCode } from '../../core/sport';
import type { Hundredths } from '../../core/time';
import type { MeasurementKind } from '../timing';
import type { HistoryOrigin } from './components/HistoryList';

/** What the athlete achieved, measured in the app or imported from an official source: the input of the personal best. */
export type Achievement = {
  id: string;
  kind: MeasurementKind;
  // Null is a missing time, never 0.
  hundredths: Hundredths | null;
  // An ISO timestamp for a measured time, a yyyy-mm-dd date for an imported one.
  capturedAt: string;
  origin: HistoryOrigin;
  // Name of the organization behind an imported result, from data; never written in code.
  sourceName?: string;
};

export type EventAchievement = Achievement & { stroke: StrokeCode; distance: DistanceCode; pool: PoolCode };

/** What the profile and the marks need of an imported official result; the results-import module's repository satisfies it. */
export type ImportedHistoryResult = {
  id: string;
  // The adapter that imported it; the route maps it to the organization's name.
  provider: string;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  hundredths: Hundredths | null;
  // yyyy-mm-dd
  swumOn: string;
};

/** The calendar day of an achievement: the date of an imported result, the day of a measured one. */
export const achievementDay = (capturedAt: string) => capturedAt.slice(0, 10);

/** An imported official result counts as a race, on its competition date (the rule confirmed in issue 204). */
export function importedAchievement(result: ImportedHistoryResult, sourceName?: string): EventAchievement {
  return {
    id: result.id,
    kind: 'race',
    hundredths: result.hundredths,
    capturedAt: result.swumOn,
    origin: 'import',
    ...(sourceName ? { sourceName } : {}),
    stroke: result.stroke,
    distance: result.distance,
    pool: result.pool,
  };
}

/** The most recent achievement by day (the latest capture, then the id, on a tie); undefined without any. */
export function latestAchievement<T extends Achievement>(list: readonly T[]): T | undefined {
  return list.reduce<T | undefined>((latest, a) => {
    if (!latest) return a;
    const order = achievementDay(a.capturedAt).localeCompare(achievementDay(latest.capturedAt)) || a.capturedAt.localeCompare(latest.capturedAt) || a.id.localeCompare(latest.id);
    return order > 0 ? a : latest;
  }, undefined);
}
