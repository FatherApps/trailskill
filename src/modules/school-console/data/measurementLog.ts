import { t } from '../../../core/i18n';
import { distances, strokes, type DistanceCode, type StrokeCode } from '../../../core/sport';
import type { Hundredths } from '../../../core/time';
import type { SwimmerRowProps } from '../../../core/ui';
import {
  createPowerSyncSchoolAthleteRepository,
  type SchoolAthleteRepository,
} from '../../athletes';
import {
  createPowerSyncMeasurementRepository,
  type MeasurementKind,
  type MeasurementRepository,
} from '../../timing';
import '../i18n';
import type { MeasurementFilterId } from '../components/athleteTypes';
import { eventLabel } from '../components/eventLabel';
import { localDate } from '../components/formatDate';
import { colorOf, initialsOf } from './consoleAthletes';

// One measurement of the school as the log needs it. A missing time is `null`, never 0.
export type LogMeasurement = {
  id: string;
  athleteId: string;
  // "First Last".
  athlete: string;
  initials: string;
  color: NonNullable<SwimmerRowProps['color']>;
  categoryId: string | null;
  stroke: StrokeCode;
  distance: DistanceCode;
  kind: MeasurementKind;
  time: Hundredths | null;
  // User id of whoever wrote it: names are not readable by a school admin yet (issue 220).
  authorId: string;
  deviceId: string;
  // ISO 8601.
  capturedAt: string;
};

export interface MeasurementLogRepository {
  /** The measurements of the school's athletes written for the school, newest first (by id on a tie). Local database only. */
  list(schoolId: string): Promise<LogMeasurement[]>;
}

type Dependencies = {
  athletes: SchoolAthleteRepository;
  measurements: Pick<MeasurementRepository, 'listBySchool'>;
};

export function createMeasurementLogRepository({ athletes, measurements }: Dependencies): MeasurementLogRepository {
  return {
    async list(schoolId) {
      // shortcut: reads every measurement of the school so the filters see them all; the screen shows a page at a time.
      // Upgrade to keyset paging in SQL when a school passes tens of thousands of rows.
      const [members, stored] = await Promise.all([athletes.listBySchool(schoolId), measurements.listBySchool(schoolId)]);
      const byId = new Map(members.map((athlete) => [athlete.id, athlete]));
      return stored.flatMap((m) => {
        // The school's own athlete list scopes the log too, so a measurement of an athlete who is not the school's never shows.
        const athlete = m.athleteId === null ? undefined : byId.get(m.athleteId);
        if (!athlete) return [];
        return [
          {
            id: m.id,
            athleteId: athlete.id,
            athlete: `${athlete.firstName} ${athlete.lastName}`,
            initials: initialsOf(athlete.firstName, athlete.lastName),
            color: colorOf(athlete.id),
            categoryId: athlete.categoryId,
            stroke: m.stroke,
            distance: m.distance,
            kind: m.kind,
            time: m.hundredths,
            authorId: m.createdBy,
            deviceId: m.deviceId,
            capturedAt: m.capturedAt,
          },
        ];
      });
    },
  };
}

export function createPowerSyncMeasurementLogRepository(): MeasurementLogRepository {
  return createMeasurementLogRepository({
    athletes: createPowerSyncSchoolAthleteRepository(),
    measurements: createPowerSyncMeasurementRepository(),
  });
}

export type MeasurementFilters = Partial<Record<MeasurementFilterId, string>>;

export const dateRanges = ['today', '7d', '30d'] as const;
const rangeDays = { today: 1, '7d': 7, '30d': 30 } as const;

/** The first 8 characters of an id: enough to tell two authors or devices apart until their names are readable. */
export const shortId = (id: string) => id.slice(0, 8);

export const eventKey = (m: Pick<LogMeasurement, 'stroke' | 'distance'>) => `${m.stroke}-${m.distance}`;

const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** The search (athlete name, case and accent insensitive) and the filters combine with AND. The ranges count local days up to today. */
export function filterMeasurements(
  list: readonly LogMeasurement[],
  query: string,
  filters: MeasurementFilters,
  now: Date,
): LogMeasurement[] {
  const needle = plain(query.trim());
  const since = filters.range
    ? localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (rangeDays[filters.range as keyof typeof rangeDays] - 1)))
    : null;
  return list.filter(
    (m) =>
      plain(m.athlete).includes(needle) &&
      (!filters.category || m.categoryId === filters.category) &&
      (!filters.event || eventKey(m) === filters.event) &&
      (!filters.coach || m.authorId === filters.coach) &&
      (since === null || localDate(new Date(m.capturedAt)) >= since),
  );
}

const position = (catalog: readonly { code: string }[], code: string) => catalog.findIndex((entry) => entry.code === code);

/** Only the values present in the list (the ranges are always offered). `categoryNames` is the school's category list in its own order. */
export function measurementFilterOptions(
  list: readonly LogMeasurement[],
  categoryNames: ReadonlyMap<string, string>,
): Record<MeasurementFilterId, { id: string; label: string }[]> {
  const present = new Set(list.map((m) => m.categoryId));
  const events = new Map(list.map((m) => [eventKey(m), m]));
  return {
    category: [...categoryNames].filter(([id]) => present.has(id)).map(([id, label]) => ({ id, label })),
    event: [...events]
      .sort(
        ([, a], [, b]) =>
          position(strokes, a.stroke) - position(strokes, b.stroke) || position(distances, a.distance) - position(distances, b.distance),
      )
      .map(([id, m]) => ({ id, label: eventLabel(m.stroke, m.distance) })),
    coach: [...new Set(list.map((m) => m.authorId))].sort().map((id) => ({ id, label: shortId(id) })),
    range: dateRanges.map((id) => ({ id, label: t(`schoolConsole.measurements.range.${id}`) })),
  };
}
