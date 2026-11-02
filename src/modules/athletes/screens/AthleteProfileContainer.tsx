import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { AuthorizationStatusRepository } from '../../accounts';
import { distances, pools, strokes } from '../../../core/sport';
import { useRecordSyncStates, type RecordSyncState } from '../../../core/sync';
import { importedAchievement, latestAchievement, type EventAchievement, type ImportedHistoryResult } from '../achievements';
import type { EventValue } from '../components/EventSelector';
import type { ImportPromptProps } from '../components/ImportPrompt';
import { ProgressChart } from '../components/ProgressChart';
import type { HistoryOrigin, HistoryResult } from '../components/HistoryList';
import type { AthleteSchoolRepository } from '../data/athleteSchools';
import type { HistoryMeasurement, HistoryRepository } from '../data/history';
import type { OtherSchoolResult, OtherSchoolResultsRepository } from '../data/otherSchoolResults';
import type { SchoolAthlete, SchoolAthleteRepository } from '../data/schoolAthletes';
import { athleteDisplay } from '../athleteDisplay';
import { eventOptions, settleEvent } from '../eventOptions';
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
  // Official results imported from the source, read from the device. They show in the history with their origin and count as races in the personal best (issue 204).
  importedResults?: { listByAthlete(athleteId: string): Promise<ImportedHistoryResult[]> };
  // The organization behind each import provider, from data; an unknown one shows with the generic origin.
  sourceNames?: Readonly<Record<string, string>>;
  // The official-results update of the results-import module. Pass it only to viewers that may import.
  officialUpdate?: ReactNode;
  // Only guardians and adults get it: the route decides by passing it or not.
  importPrompt?: ImportPromptProps;
  // Where the band's back button goes; the route decides (the module has no router).
  onBack: () => void;
};

type ProfileSchool = { id: string; name: string; category: string };

type Loaded =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'denied' }
  // `measurements` and `imported` are every result of the athlete: the events to choose from and the rows of the chosen one come from them.
  | { kind: 'ready'; athlete: SchoolAthlete; authorized: boolean; measurements: HistoryMeasurement[]; imported: ImportedHistoryResult[]; schools: ProfileSchool[] };

// What the server answered about the other schools' results; `null` covers a server error and a missing answer.
type OtherAnswer = { key: string; results: OtherSchoolResult[] | null };

// With a weak connection the section gives up and offers a retry; the rest of the profile never waits for it.
const OTHER_SCHOOL_TIMEOUT_MS = 10_000;

const initialEvent: EventValue = { stroke: strokes[0].code, distance: distances[1].code, pool: pools[0].code };
const day = (iso: string) => iso.slice(0, 10);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

// The order of `public.other_school_results`: newest first, ties by id descending (plain comparison, like uuid in Postgres).
const newestFirst = (a: { capturedAt: string; id: string }, b: { capturedAt: string; id: string }) =>
  a.capturedAt !== b.capturedAt ? (a.capturedAt < b.capturedAt ? 1 : -1) : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;

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

// An imported official result is always a competition result, read-only; it can be the personal best like any race.
function toImportedResult(r: ImportedHistoryResult, sourceName: string | undefined, personalBestId: string | undefined): HistoryResult {
  return {
    id: r.id,
    stroke: r.stroke,
    distance: r.distance,
    date: r.swumOn,
    context: 'competition',
    origin: 'import',
    ...(sourceName ? { sourceName } : {}),
    value: { kind: 'race' },
    time: r.hundredths,
    isPersonalBest: r.id === personalBestId,
  };
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

// Connects the profile screen to the athlete, their history and the authorization on this device.
// The device is read once per athlete: the events to choose, the personal best, the chart and the history of the chosen event
// are all worked out from that one read, so choosing another event or pool never goes back to a loading screen.
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
  importedResults,
  sourceNames,
  officialUpdate,
  importPrompt,
  onBack,
}: AthleteProfileContainerProps) {
  // The event the person chose, for this athlete; until then the profile opens in the event of the athlete's most recent result, and with no results as before.
  const [chosen, setChosen] = useState<{ athleteId: string; event: EventValue }>();
  const [attempt, setAttempt] = useState(0);
  const [otherAttempt, setOtherAttempt] = useState(0);
  const [chosenSchoolId, setChosenSchoolId] = useState('');
  // The answer is stored with the request it belongs to: any other request shows as loading until its own answer lands.
  const requestKey = `${athleteId}|${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; result: Loaded }>();
  const loaded = useMemo<Loaded>(() => (answer?.key === requestKey ? answer.result : { kind: 'loading' }), [answer, requestKey]);
  // The age of the last sync is read once, when the profile opens, so it does not change on every render.
  const [openedAt] = useState(() => Date.now());

  // The device's own data: it does not depend on the connection or on the other-school repository.
  useEffect(() => {
    let active = true;
    (async () => {
      const [athlete] = await athletes.listByIds([athleteId]);
      if (!athlete) return { kind: 'denied' } as const;
      const [granted, measurements, schools, imported] = await Promise.all([
        authorizations.listGrantedAthleteIds('record_times'),
        history.listByAthlete(athleteId),
        readSchools(athleteId, schoolLinks, schoolNames, categories),
        importedResults?.listByAthlete(athleteId) ?? [],
      ]);
      return { kind: 'ready', athlete, authorized: granted.includes(athleteId), measurements, imported, schools } as const;
    })()
      // A failed read is an error with a retry, never "no data": the profile of an athlete with results must not look empty.
      .catch((): Loaded => ({ kind: 'error' }))
      .then((result) => active && setAnswer({ key: requestKey, result }));
    return () => {
      active = false;
    };
  }, [athleteId, athletes, authorizations, history, importedResults, schoolLinks, schoolNames, categories, requestKey]);

  // Every result of the athlete as an achievement: the personal best, the marks and the events on offer read the same list.
  const achievements = useMemo<EventAchievement[]>(
    () =>
      loaded.kind === 'ready'
        ? [...loaded.measurements, ...loaded.imported.map((r) => importedAchievement(r, sourceNames?.[r.provider]))]
        : [],
    [loaded, sourceNames],
  );
  const chosenEvent = chosen?.athleteId === athleteId ? chosen.event : undefined;
  const latest = useMemo(() => latestAchievement(achievements), [achievements]);
  const event = useMemo<EventValue | undefined>(() => {
    if (loaded.kind !== 'ready') return undefined;
    if (chosenEvent) return chosenEvent;
    return latest ? { stroke: latest.stroke, distance: latest.distance, pool: latest.pool } : initialEvent;
  }, [loaded.kind, chosenEvent, latest]);

  // Other schools' results: asked to the server only while connected, apart from the rest, so a connection change or a slow
  // server only touches this section. The answer is dropped when the request ends, so none is kept once the connection is lost.
  const otherKey = event ? `${athleteId}|${event.stroke}|${event.distance}|${event.pool}|${otherAttempt}` : '';
  const [otherAnswer, setOtherAnswer] = useState<OtherAnswer>();
  useEffect(() => {
    if (!otherSchoolResults || !online || !event) return;
    let active = true;
    withTimeout(otherSchoolResults.listByEvent(athleteId, event), OTHER_SCHOOL_TIMEOUT_MS).then(
      (results) => active && setOtherAnswer({ key: otherKey, results }),
      () => active && setOtherAnswer({ key: otherKey, results: null }),
    );
    return () => {
      active = false;
      setOtherAnswer(undefined);
    };
  }, [athleteId, event, otherKey, otherSchoolResults, online]);
  const other = otherSchoolResults && online && otherAnswer?.key === otherKey ? otherAnswer.results : undefined;

  // The results of the chosen event, from the one read.
  const inEvent = useCallback(
    (r: { stroke: string; distance: string; pool: string }) => !!event && r.stroke === event.stroke && r.distance === event.distance && r.pool === event.pool,
    [event],
  );
  const measurements = useMemo(() => (loaded.kind === 'ready' ? loaded.measurements.filter(inEvent) : []), [loaded, inEvent]);
  const imported = useMemo(() => (loaded.kind === 'ready' ? loaded.imported.filter(inEvent) : []), [loaded, inEvent]);

  const ids = useMemo(() => measurements.map((m) => m.id), [measurements]);
  const syncStates = useRecordSyncStates('measurements', ids);
  // The hook answers with a new Map on every render: key the rows on what it says, so they (and the chart) change only when a state does.
  const syncKey = ids.map((id) => syncStates.get(id) ?? 'on_device').join('|');
  const states = useMemo(() => new Map(ids.map((id, i) => [id, syncKey.split('|')[i] as RecordSyncState])), [ids, syncKey]);

  // The best comes from the device's own data only (its measurements and the results imported to it): offline it must not change.
  const best = useMemo(() => personalBest([...measurements, ...imported.map((r) => importedAchievement(r, sourceNames?.[r.provider]))]), [measurements, imported, sourceNames]);
  // Memoized: the chart draws these rows, and it must not redraw on every render of the profile.
  const historyRows = useMemo(() => {
    // Newest first. A measurement the server also lists but the device already has (staff of both schools) is shown once, with its own sync state.
    const localIds = new Set(measurements.map((m) => m.id));
    const rows = [
      ...measurements.map((m) => ({ m, syncState: states.get(m.id) ?? ('on_device' as const) })),
      ...(other ?? []).filter((m) => !localIds.has(m.id)).map((m) => ({ m: { ...m, origin: 'other_school' as const }, syncState: undefined })),
    ].sort((a, b) => newestFirst(a.m, b.m));
    // Stable by date: the device's own rows keep their order within a day.
    return [...rows.flatMap(({ m, syncState }) => toResult(m, best?.id, syncState)), ...imported.map((r) => toImportedResult(r, sourceNames?.[r.provider], best?.id))].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [measurements, imported, other, states, best, sourceNames]);
  const chart = useMemo(() => <ProgressChart results={historyRows} />, [historyRows]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const retryOtherSchool = useCallback(() => setOtherAttempt((n) => n + 1), []);
  const choose = useCallback((next: EventValue) => setChosen({ athleteId, event: settleEvent(achievements, next) }), [athleteId, achievements]);

  if (loaded.kind === 'loading') return <AthleteProfileScreen name="" view={{ kind: 'loading' }} onBack={onBack} />;
  if (loaded.kind === 'denied') return <AthleteProfileScreen name="" view={{ kind: 'denied' }} onBack={onBack} />;
  if (loaded.kind === 'error') return <AthleteProfileScreen name="" view={{ kind: 'error', onRetry: retry }} onBack={onBack} />;
  // A ready profile always has an event (the most recent result's, or the default); this only narrows the type.
  if (!event) return <AthleteProfileScreen name="" view={{ kind: 'loading' }} onBack={onBack} />;

  const { athlete, authorized, schools } = loaded;
  // A choice that is no longer among the athlete's schools falls back to the first one.
  const school = schools.find((s) => s.id === chosenSchoolId) ?? schools[0];
  const options = eventOptions(achievements, event.pool);
  const content = {
    header: {
      name: `${athlete.firstName} ${athlete.lastName}`.trim(),
      color: athleteDisplay(athlete).color,
      onBack,
      category: school?.category ?? '',
      schools: schools.map(({ id, name }) => ({ id, name })),
      schoolId: school?.id ?? '',
      onSchoolChange: setChosenSchoolId,
      authorization: authorized ? ('valid' as const) : ('pending' as const),
      updatedMinutesAgo: lastSyncedAt ? Math.max(0, Math.round((openedAt - lastSyncedAt.getTime()) / 60000)) : null,
    },
    // Only the events and pools with results; none at all while the athlete has none.
    event: { events: options.events, pools: options.pools, value: event, onChange: choose },
    personalBest: {
      ...event,
      best: best?.hundredths ?? null,
      ...(best?.improvement
        ? { improvement: { hundredths: best.improvement.hundredths, months: monthsBetween(day(best.improvement.previousDate), day(best.date)) } }
        : {}),
      ...(best ? { kind: best.kind === 'race' ? ('competition' as const) : ('training' as const), date: day(best.date) } : {}),
    },
    history: historyRows,
    // The chart draws the same rows as the history, so imported results and the personal best are the ones the list shows.
    chart,
    ...(officialUpdate ? { officialUpdate } : {}),
    ...(importPrompt ? { importPrompt } : {}),
    ...(otherSchoolResults && !online ? { otherSchoolOffline: true } : {}),
    // Connected but the server failed or did not answer: not the offline notice, a retry of this section only.
    ...(other === null ? { otherSchoolError: { onRetry: retryOtherSchool } } : {}),
  };
  const view: AthleteProfileView = content.history.length === 0 ? { kind: 'empty', content } : { kind: 'data', content };
  return <AthleteProfileScreen name={athlete.firstName} view={view} onBack={onBack} />;
}
