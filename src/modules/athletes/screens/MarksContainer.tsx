import { useCallback, useEffect, useState } from 'react';

import type { PoolCode } from '../../../core/sport';
import type { ManagedAthleteRepository } from '../../accounts';
import { athleteDisplay } from '../athleteDisplay';
import { distanceLabel, strokeLabel } from '../components/sportLabel';
import type { HistoryMeasurement, HistoryRepository } from '../data/history';
import type { SchoolAthleteRepository } from '../data/schoolAthletes';
import { useManagedAthletes } from '../data/useManagedAthletes';
import { useSelfAthleteId } from '../data/useSelfAthleteId';
import { marksByEvent } from '../marks';
import { MarksScreen, type MarksView } from './MarksScreen';

export type MarksContainerProps = {
  userId: string | undefined;
  managed: ManagedAthleteRepository;
  athletes: SchoolAthleteRepository;
  history: Pick<HistoryRepository, 'listByAthlete'>;
  // Changing it looks the athletes up again (the route passes the last sync).
  refreshKey?: unknown;
  scrollEnabled?: boolean;
};

type Read = { athleteId: string; attempt: number; result: HistoryMeasurement[] | 'error' };

const day = (iso: string) => iso.slice(0, 10);

// Connects the screen to the athletes the user manages and the local history of the one chosen. The pool filter is applied here, on what the device holds.
export function MarksContainer({ userId, managed, athletes, history, refreshKey, scrollEnabled }: MarksContainerProps) {
  const result = useManagedAthletes(managed, athletes, userId, refreshKey);
  const selfId = useSelfAthleteId(managed, userId, refreshKey);
  const [chosenId, setChosenId] = useState<string>();
  const [pool, setPool] = useState<PoolCode>('SCM');
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<Read>();

  // The user's own athlete goes first, as in "Mis deportistas"; a choice no longer among the athletes falls back to the first.
  const list = result.status === 'ready' ? [...result.athletes.filter((a) => a.id === selfId), ...result.athletes.filter((a) => a.id !== selfId)] : [];
  const selected = list.find((a) => a.id === chosenId) ?? list[0];
  const selectedId = selected?.id;

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    history.listByAthlete(selectedId).then(
      (found) => active && setRead({ athleteId: selectedId, attempt, result: found }),
      () => active && setRead({ athleteId: selectedId, attempt, result: 'error' }),
    );
    return () => {
      active = false;
    };
  }, [history, selectedId, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  let view: MarksView;
  if (result.status === 'loading') view = { kind: 'loading' };
  else if (!selected) view = { kind: 'empty' };
  else if (read?.athleteId !== selected.id || read.attempt !== attempt) view = { kind: 'loading' };
  else if (read.result === 'error') view = { kind: 'error', onRetry: retry };
  else {
    view = {
      kind: 'data',
      athletes: list.map((a) => {
        const { shortName, initials, color } = athleteDisplay(a);
        return { id: a.id, name: shortName, initials, color };
      }),
      selectedId: selected.id,
      firstName: selected.firstName,
      pool,
      cards: marksByEvent(read.result, pool).map(({ id, stroke, distance, best }) => ({
        id,
        event: `${strokeLabel(stroke)} ${distanceLabel(distance)}`,
        time: best?.hundredths ?? null,
        // Same rule as the profile: a race is a competition, any other eligible kind is training.
        ...(best ? { origin: best.kind === 'race' ? ('competition' as const) : ('training' as const), date: day(best.date) } : {}),
      })),
    };
  }
  return <MarksScreen view={view} onSelectAthlete={setChosenId} onPoolChange={setPool} scrollEnabled={scrollEnabled} />;
}
