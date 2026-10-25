import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AuthorizationStatusRepository } from '../../accounts';
import { distances, pools, strokes } from '../../../core/sport';
import { useRecordSyncStates } from '../../../core/sync';
import type { EventValue } from '../components/EventSelector';
import type { HistoryOrigin, HistoryResult } from '../components/HistoryList';
import type { AthleteSchoolRepository } from '../data/athleteSchools';
import type { HistoryMeasurement, HistoryRepository } from '../data/history';
import type { OtherSchoolResult, OtherSchoolResultsRepository } from '../data/otherSchoolResults';
import type { SchoolAthlete, SchoolAthleteRepository } from '../data/schoolAthletes';
import { personalBest } from '../personalBest';
import { AthleteProfileScreen, type AthleteProfileView } from './AthleteProfileScreen';

export type AthleteProfileContainerProps = {
  athleteId: string;
  athletes: SchoolAthleteRepository;
  history: HistoryRepository;
  authorizations: AuthorizationStatusRepository;
  schoolLinks: AthleteSchoolRepository;
  // Satisfied by the school console's repositories: the names of the schools and of their categories.
  schoolNames: { listByIds(ids: readonly string[]): Promise<{ id: string; name: string }[]> };
  categories: { listCategories(schoolId: string): Promise<{ id: string; name: string }[]> };
  // When the last sync finished; `null` when it never did.
  lastSyncedAt: Date | null;
  // Results of other schools, asked to the server each time and never stored. Pass it only to viewers that may see them.
  otherSchoolResults?: OtherSchoolResultsRepository;
  // Whether the device is connected. Without a connection no result of another school is asked for or shown.
  online?: boolean;
};

type ProfileSchool = { id: string; name: string; category: string };

type Loaded =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'denied' }
  | { kind: 'ready'; athlete: SchoolAthlete; authorized: boolean; measurements: HistoryMeasurement[]; schools: ProfileSchool[]; otherSchool: OtherSchoolResult[]; otherSchoolOffline: boolean };

const initialEvent: EventValue = { stroke: strokes[0].code, distance: distances[1].code, pool: pools[0].code };
const day = (iso: string) => iso.slice(0, 10);

// Whole months between two ISO dates; never negative.
function monthsBetween(from: string, to: string) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return Math.max(0, (ty! - fy!) * 12 + (tm! - fm!));
}

// The split distance is not stored with the split, so splits stay out of the history instead of showing a guessed distance.
function toResult(m: OtherSchoolResult & { origin: HistoryOrigin }, personalBestId: string | undefined, syncState: HistoryResult['syncState']): HistoryResult[] {
  if (m.kind === 'split') return [];
  const value: HistoryResult['value'] =
    m.kind === 'race' ? { kind: 'race' } : m.kind === 'series_total' ? { kind: 'series_total' } : { kind: 'repetition', index: m.arrivalPosition ?? 1 };
  return [
    {
      id: m.id,
      stroke: m.stroke,
      distance: m.distance,
      date: day(m.capturedAt),
      context: m.sessionType,
      origin: m.origin,
      value,
      time: m.hundredths,
      ...(m.kind === 'completed' ? { completed: true } : {}),
      isPersonalBest: m.id === personalBestId,
      ...(syncState ? { syncState } : {}),
    },
  ];
}

// The athlete's schools with the category in each, by school name. A school whose name is not on the device is left out.
async function readSchools(
  athleteId: string,
  links: AthleteSchoolRepository,
  names: AthleteProfileContainerProps['schoolNames'],
  categories: AthleteProfileContainerProps['categories'],
): Promise<ProfileSchool[]> {
  const linked = await links.listByAthlete(athleteId);
  const named = await names.listByIds(linked.map((l) => l.schoolId));
  return Promise.all(
    named.map(async ({ id, name }) => {
      const categoryId = linked.find((l) => l.schoolId === id)?.categoryId;
      const category = categoryId ? (await categories.listCategories(id)).find((c) => c.id === categoryId)?.name : undefined;
      return { id, name, category: category ?? '' };
    }),
  );
}

// Connects the profile screen to the athlete, the history of the chosen event and the authorization on this device.
export function AthleteProfileContainer({
  athleteId,
  athletes,
  history,
  authorizations,
  schoolLinks,
  schoolNames,
  categories,
  lastSyncedAt,
  otherSchoolResults,
  online = false,
}: AthleteProfileContainerProps) {
  const [event, setEvent] = useState<EventValue>(initialEvent);
  const [attempt, setAttempt] = useState(0);
  const [chosenSchoolId, setChosenSchoolId] = useState('');
  // The answer is stored with the request it belongs to: any other request shows as loading until its own answer lands.
  const requestKey = `${athleteId}|${event.stroke}|${event.distance}|${event.pool}|${attempt}|${online}`;
  const [answer, setAnswer] = useState<{ key: string; result: Loaded }>();
  const loaded = useMemo<Loaded>(() => (answer?.key === requestKey ? answer.result : { kind: 'loading' }), [answer, requestKey]);
  // The age of the last sync is read once, when the profile opens, so it does not change on every render.
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    (async () => {
      const [athlete] = await athletes.listByIds([athleteId]);
      if (!athlete) return { kind: 'denied' } as const;
      // Offline, or when the server fails, none of them show; the rest of the profile does not depend on them.
      const otherSchool =
        otherSchoolResults && online
          ? otherSchoolResults.listByEvent(athleteId, event).then(
              (results) => ({ results, offline: false }),
              () => ({ results: [], offline: true }),
            )
          : { results: [], offline: otherSchoolResults !== undefined };
      const [granted, measurements, schools, other] = await Promise.all([
        authorizations.listGrantedAthleteIds('record_times'),
        history.listByEvent(athleteId, event),
        readSchools(athleteId, schoolLinks, schoolNames, categories),
        otherSchool,
      ]);
      return {
        kind: 'ready',
        athlete,
        authorized: granted.includes(athleteId),
        measurements,
        schools,
        otherSchool: other.results,
        otherSchoolOffline: other.offline,
      } as const;
    })()
      .catch((): Loaded => ({ kind: 'error' }))
      .then((result) => active && setAnswer({ key: requestKey, result }));
    return () => {
      active = false;
    };
  }, [athleteId, athletes, authorizations, history, schoolLinks, schoolNames, categories, event, requestKey, otherSchoolResults, online]);

  const ids = useMemo(() => (loaded.kind === 'ready' ? loaded.measurements.map((m) => m.id) : []), [loaded]);
  const syncStates = useRecordSyncStates('measurements', ids);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (loaded.kind === 'loading') return <AthleteProfileScreen name="" view={{ kind: 'loading' }} />;
  if (loaded.kind === 'denied') return <AthleteProfileScreen name="" view={{ kind: 'denied' }} />;
  if (loaded.kind === 'error') return <AthleteProfileScreen name="" view={{ kind: 'error', onRetry: retry }} />;

  const { athlete, authorized, measurements, schools, otherSchool, otherSchoolOffline } = loaded;
  // A choice that is no longer among the athlete's schools falls back to the first one.
  const school = schools.find((s) => s.id === chosenSchoolId) ?? schools[0];
  // The best comes from the device's own measurements only: offline it must not change.
  const best = personalBest(measurements);
  // Newest first; a measurement the server also lists is shown once, as the other school's.
  const otherIds = new Set(otherSchool.map((r) => r.id));
  const rows = [
    ...measurements.filter((m) => !otherIds.has(m.id)).map((m) => ({ m, syncState: syncStates.get(m.id) ?? ('on_device' as const) })),
    ...otherSchool.map((m) => ({ m: { ...m, origin: 'other_school' as const }, syncState: undefined })),
  ].sort((a, b) => (a.m.capturedAt === b.m.capturedAt ? a.m.id.localeCompare(b.m.id) : b.m.capturedAt.localeCompare(a.m.capturedAt)));
  const content = {
    header: {
      name: `${athlete.firstName} ${athlete.lastName}`.trim(),
      category: school?.category ?? '',
      schools: schools.map(({ id, name }) => ({ id, name })),
      schoolId: school?.id ?? '',
      onSchoolChange: setChosenSchoolId,
      authorization: authorized ? ('valid' as const) : ('pending' as const),
      updatedMinutesAgo: lastSyncedAt ? Math.max(0, Math.round((openedAt - lastSyncedAt.getTime()) / 60000)) : null,
    },
    event: {
      strokes: strokes.map((s) => s.code),
      distances: distances.map((d) => d.code),
      pools: pools.map((p) => p.code),
      value: event,
      onChange: setEvent,
    },
    personalBest: {
      ...event,
      best: best?.hundredths ?? null,
      ...(best?.improvement
        ? { improvement: { hundredths: best.improvement.hundredths, months: monthsBetween(day(best.improvement.previousDate), day(best.date)) } }
        : {}),
      ...(best ? { kind: best.kind === 'race' ? ('competition' as const) : ('training' as const), date: day(best.date) } : {}),
    },
    history: rows.flatMap(({ m, syncState }) => toResult(m, best?.id, syncState)),
    ...(otherSchoolOffline ? { otherSchoolOffline } : {}),
  };
  const view: AthleteProfileView = content.history.length === 0 ? { kind: 'empty', content } : { kind: 'data', content };
  return <AthleteProfileScreen name={athlete.firstName} view={view} />;
}
