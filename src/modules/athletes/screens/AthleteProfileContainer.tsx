import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AuthorizationStatusRepository } from '../../accounts';
import { distances, pools, strokes } from '../../../core/sport';
import { useRecordSyncStates } from '../../../core/sync';
import type { EventValue } from '../components/EventSelector';
import type { HistoryResult } from '../components/HistoryList';
import type { HistoryMeasurement, HistoryRepository } from '../data/history';
import type { SchoolAthlete, SchoolAthleteRepository } from '../data/schoolAthletes';
import { personalBest } from '../personalBest';
import { AthleteProfileScreen, type AthleteProfileView } from './AthleteProfileScreen';

export type AthleteProfileContainerProps = {
  athleteId: string;
  athletes: SchoolAthleteRepository;
  history: HistoryRepository;
  authorizations: AuthorizationStatusRepository;
  // When the last sync finished; `null` when it never did.
  lastSyncedAt: Date | null;
};

type Loaded =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'denied' }
  | { kind: 'ready'; athlete: SchoolAthlete; authorized: boolean; measurements: HistoryMeasurement[] };

const initialEvent: EventValue = { stroke: strokes[0].code, distance: distances[1].code, pool: pools[0].code };
const day = (iso: string) => iso.slice(0, 10);

// Whole months between two ISO dates; never negative.
function monthsBetween(from: string, to: string) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return Math.max(0, (ty! - fy!) * 12 + (tm! - fm!));
}

// The split distance is not stored with the split, so splits stay out of the history instead of showing a guessed distance.
function toResult(m: HistoryMeasurement, personalBestId: string | undefined, syncState: HistoryResult['syncState']): HistoryResult[] {
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
      syncState,
    },
  ];
}

// Connects the profile screen to the athlete, the history of the chosen event and the authorization on this device.
export function AthleteProfileContainer({ athleteId, athletes, history, authorizations, lastSyncedAt }: AthleteProfileContainerProps) {
  const [event, setEvent] = useState<EventValue>(initialEvent);
  const [attempt, setAttempt] = useState(0);
  // The answer is stored with the request it belongs to: any other request shows as loading until its own answer lands.
  const requestKey = `${athleteId}|${event.stroke}|${event.distance}|${event.pool}|${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; result: Loaded }>();
  const loaded = useMemo<Loaded>(() => (answer?.key === requestKey ? answer.result : { kind: 'loading' }), [answer, requestKey]);
  // The age of the last sync is read once, when the profile opens, so it does not change on every render.
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    (async () => {
      const [athlete] = await athletes.listByIds([athleteId]);
      if (!athlete) return { kind: 'denied' } as const;
      const [granted, measurements] = await Promise.all([authorizations.listGrantedAthleteIds('record_times'), history.listByEvent(athleteId, event)]);
      return { kind: 'ready', athlete, authorized: granted.includes(athleteId), measurements } as const;
    })()
      .catch((): Loaded => ({ kind: 'error' }))
      .then((result) => active && setAnswer({ key: requestKey, result }));
    return () => {
      active = false;
    };
  }, [athleteId, athletes, authorizations, history, event, requestKey]);

  const ids = useMemo(() => (loaded.kind === 'ready' ? loaded.measurements.map((m) => m.id) : []), [loaded]);
  const syncStates = useRecordSyncStates('measurements', ids);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (loaded.kind === 'loading') return <AthleteProfileScreen name="" view={{ kind: 'loading' }} />;
  if (loaded.kind === 'denied') return <AthleteProfileScreen name="" view={{ kind: 'denied' }} />;
  if (loaded.kind === 'error') return <AthleteProfileScreen name="" view={{ kind: 'error', onRetry: retry }} />;

  const { athlete, authorized, measurements } = loaded;
  const best = personalBest(measurements);
  const content = {
    header: {
      name: `${athlete.firstName} ${athlete.lastName}`.trim(),
      // shortcut: the category and school names live in the school console's tables, so the header shows neither; upgrade with a shared read.
      category: '',
      schools: [],
      schoolId: '',
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
    history: measurements.flatMap((m) => toResult(m, best?.id, syncStates.get(m.id) ?? 'on_device')),
  };
  const view: AthleteProfileView = content.history.length === 0 ? { kind: 'empty', content } : { kind: 'data', content };
  return <AthleteProfileScreen name={athlete.firstName} view={view} />;
}
