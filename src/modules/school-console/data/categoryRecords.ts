import {
  createInMemoryHistoryRepository,
  createInMemorySchoolAthleteRepository,
  createPowerSyncHistoryRepository,
  createPowerSyncSchoolAthleteRepository,
  personalBest,
  type HistoryMeasurement,
  type HistoryRepository,
  type SchoolAthleteRepository,
} from "../../athletes";
import {
  distances,
  strokes,
  type DistanceCode,
  type PoolCode,
  type StrokeCode,
} from "../../../core/sport";
import type { Hundredths } from "../../../core/time";
import { localDate } from "../components/formatDate";

// The best mark of one event. A missing mark is `null` and so are the athlete and the date then: never 0.
export type CategoryRecord = {
  stroke: StrokeCode;
  distance: DistanceCode;
  time: Hundredths | null;
  // "First Last" of the athlete who holds the mark.
  athlete: string | null;
  // Local date (YYYY-MM-DD) of the mark.
  date: string | null;
};

export type CategoryRecordsQuery = {
  schoolId: string;
  categoryId: string;
  pool: PoolCode;
  // A training group narrows the category further; `null` or absent means every group.
  groupId?: string | null;
};

export interface CategoryRecordsRepository {
  /** One record per event with any measurement in the pool, in sport-catalog order. Only athletes of the school with that category. Local database only. */
  list(query: CategoryRecordsQuery): Promise<CategoryRecord[]>;
}

const position = (catalog: readonly { code: string }[], code: string) =>
  catalog.findIndex((entry) => entry.code === code);

/**
 * The record of each event in the pool among the measurements, by the same rule as a personal best (which kinds count is
 * decided there): the lowest valid time, the first achievement on a tie. A null time or a completed value never counts;
 * an event with none shows no time, athlete or date.
 */
export function selectCategoryRecords(
  measurements: readonly HistoryMeasurement[],
  pool: PoolCode,
  athleteNames: ReadonlyMap<string, string>,
): CategoryRecord[] {
  const events = new Map<string, HistoryMeasurement[]>();
  for (const m of measurements) {
    if (m.pool !== pool) continue;
    const key = `${m.stroke}-${m.distance}`;
    events.set(key, [...(events.get(key) ?? []), m]);
  }

  return [...events.values()]
    .map((list): CategoryRecord => {
      const { stroke, distance } = list[0]!;
      const best = personalBest(list);
      const holder = best ? list.find((m) => m.id === best.id) : undefined;
      return {
        stroke,
        distance,
        time: best?.hundredths ?? null,
        athlete:
          (holder?.athleteId && athleteNames.get(holder.athleteId)) || null,
        date: best ? localDate(new Date(best.date)) : null,
      };
    })
    .sort(
      (a, b) =>
        position(strokes, a.stroke) - position(strokes, b.stroke) ||
        position(distances, a.distance) - position(distances, b.distance),
    );
}

type Dependencies = {
  athletes: SchoolAthleteRepository;
  history: HistoryRepository;
};

export function createCategoryRecordsRepository({
  athletes,
  history,
}: Dependencies): CategoryRecordsRepository {
  return {
    async list({ schoolId, categoryId, pool, groupId }) {
      // The athletes of the school only: the school's own list is what scopes the records.
      const members = (await athletes.listBySchool(schoolId)).filter(
        (athlete) =>
          athlete.categoryId === categoryId &&
          (!groupId || athlete.groupIds.includes(groupId)),
      );
      // shortcut: one local read per athlete, enough for a category; upgrade to a single query by athlete ids if a category grows into hundreds.
      const measurements = (
        await Promise.all(
          members.map((athlete) => history.listByAthlete(athlete.id)),
        )
      ).flat();
      return selectCategoryRecords(
        measurements,
        pool,
        new Map(members.map((a) => [a.id, `${a.firstName} ${a.lastName}`])),
      );
    },
  };
}

export function createPowerSyncCategoryRecordsRepository(): CategoryRecordsRepository {
  return createCategoryRecordsRepository({
    athletes: createPowerSyncSchoolAthleteRepository(),
    history: createPowerSyncHistoryRepository(),
  });
}

export function createInMemoryCategoryRecordsRepository(
  rows: Parameters<typeof createInMemorySchoolAthleteRepository>[0],
  measurements: HistoryMeasurement[],
): CategoryRecordsRepository {
  return createCategoryRecordsRepository({
    athletes: createInMemorySchoolAthleteRepository(rows),
    history: createInMemoryHistoryRepository(measurements),
  });
}
