import {
  createPowerSyncAuthorizationStatusRepository,
  type AuthorizationStatusRepository,
} from '../../accounts';
import {
  createPowerSyncHistoryRepository,
  createPowerSyncSchoolAthleteRepository,
  personalBest,
  type HistoryRepository,
  type SchoolAthleteRepository,
} from '../../athletes';
import { distances, pools, strokes } from '../../../core/sport';
import type { Hundredths } from '../../../core/time';
import type { SwimmerRowProps } from '../../../core/ui';
import { createPowerSyncMeasurementRepository, type MeasurementRepository } from '../../timing';
import type { AthleteAuthorization, AthleteBest } from '../components/athleteTypes';
import { eventLabel } from '../components/eventLabel';
import { createPowerSyncSchoolStructureRepository, type SchoolStructureRepository } from './schoolStructure';

// PROVISIONAL (S10, issue 204): the personal best column shows this event only.
export const CONSOLE_BEST_EVENT = { stroke: 'FR', distance: '50m', pool: 'SCM' } as const;

export type ConsoleAthlete = {
  id: string;
  // "First Last".
  name: string;
  initials: string;
  color: NonNullable<SwimmerRowProps['color']>;
  categoryId: string | null;
  // Name of the category; null when the athlete has none or it is not one of the school's.
  category: string | null;
  categorySortOrder: number | null;
  groupIds: string[];
  // Names of the school's groups, in the order of groupIds (sorted by name).
  groups: string[];
  coachIds: string[];
  // 'valid' when record_times is granted, otherwise 'pending'.
  authorization: AthleteAuthorization;
  // Never 0: null when the athlete has no eligible time in CONSOLE_BEST_EVENT.
  bestTime: Hundredths | null;
};

export interface ConsoleAthletesRepository {
  /** Athletes of the school, in the order of SchoolAthleteRepository. Local database only. */
  listAthletes(schoolId: string): Promise<ConsoleAthlete[]>;
  /** Measurements of the athletes captured at or after `since` (ISO 8601). */
  countMeasurementsSince(athleteIds: readonly string[], since: string): Promise<number>;
  /** One personal best per event, ordered by the sport catalogs (stroke, distance, pool). */
  listBests(athleteId: string): Promise<AthleteBest[]>;
}

type Dependencies = {
  athletes: SchoolAthleteRepository;
  authorizations: AuthorizationStatusRepository;
  history: HistoryRepository;
  measurements: Pick<MeasurementRepository, 'countCapturedSince'>;
  structure: SchoolStructureRepository;
};

const colors = ['athlete-1', 'athlete-2', 'athlete-3', 'athlete-4'] as const;
// The same athlete keeps the same color on every launch.
const colorOf = (id: string) => colors[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length]!;

const initialsOf = (firstName: string, lastName: string) => `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
const position = (catalog: readonly { code: string }[], code: string) => catalog.findIndex((entry) => entry.code === code);

export function createConsoleAthletesRepository({ athletes, authorizations, history, measurements, structure }: Dependencies): ConsoleAthletesRepository {
  return {
    async listAthletes(schoolId) {
      const listed = await athletes.listBySchool(schoolId);
      const [granted, categories, groups, assignments] = await Promise.all([
        authorizations.listGrantedAthleteIds('record_times'),
        structure.listCategories(schoolId),
        structure.listGroups(schoolId),
        structure.listCoachAssignments(schoolId, listed.map((a) => a.id)),
      ]);
      const grantedIds = new Set(granted);
      const categoryById = new Map(categories.map((c) => [c.id, c]));
      const groupById = new Map(groups.map((g) => [g.id, g]));

      return Promise.all(
        listed.map(async (athlete) => {
          const category = athlete.categoryId ? categoryById.get(athlete.categoryId) : undefined;
          const schoolGroups = athlete.groupIds
            .flatMap((id) => groupById.get(id) ?? [])
            .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
          const groupIds = new Set(schoolGroups.map((g) => g.id));
          const coachIds = new Set(
            assignments
              .filter((a) => (a.groupId !== null && groupIds.has(a.groupId)) || a.athleteId === athlete.id)
              .map((a) => a.coachId),
          );
          const best = personalBest(await history.listByEvent(athlete.id, CONSOLE_BEST_EVENT));
          return {
            id: athlete.id,
            name: `${athlete.firstName} ${athlete.lastName}`,
            initials: initialsOf(athlete.firstName, athlete.lastName),
            color: colorOf(athlete.id),
            categoryId: category?.id ?? null,
            category: category?.name ?? null,
            categorySortOrder: category?.sortOrder ?? null,
            groupIds: schoolGroups.map((g) => g.id),
            groups: schoolGroups.map((g) => g.name),
            coachIds: [...coachIds].sort(),
            authorization: grantedIds.has(athlete.id) ? 'valid' : 'pending',
            bestTime: best?.hundredths ?? null,
          };
        }),
      );
    },
    countMeasurementsSince(athleteIds, since) {
      return measurements.countCapturedSince(athleteIds, since);
    },
    async listBests(athleteId) {
      const events = new Map<string, Awaited<ReturnType<HistoryRepository['listByAthlete']>>>();
      for (const m of await history.listByAthlete(athleteId)) {
        const key = `${m.stroke}-${m.distance}-${m.pool}`;
        events.set(key, [...(events.get(key) ?? []), m]);
      }
      return [...events]
        .flatMap(([id, list]) => {
          const best = personalBest(list);
          return best ? [{ id, event: list[0]!, time: best.hundredths }] : [];
        })
        .sort(
          (a, b) =>
            position(strokes, a.event.stroke) - position(strokes, b.event.stroke) ||
            position(distances, a.event.distance) - position(distances, b.event.distance) ||
            position(pools, a.event.pool) - position(pools, b.event.pool),
        )
        .map(({ id, event, time }) => ({
          id,
          event: `${eventLabel(event.stroke, event.distance)} · ${pools.find((p) => p.code === event.pool)?.lengthMeters ?? event.pool} m`,
          time,
        }));
    },
  };
}

export function createPowerSyncConsoleAthletesRepository(): ConsoleAthletesRepository {
  return createConsoleAthletesRepository({
    athletes: createPowerSyncSchoolAthleteRepository(),
    authorizations: createPowerSyncAuthorizationStatusRepository(),
    history: createPowerSyncHistoryRepository(),
    measurements: createPowerSyncMeasurementRepository(),
    structure: createPowerSyncSchoolStructureRepository(),
  });
}
