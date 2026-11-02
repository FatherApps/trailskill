import { useCallback, useEffect, useState } from 'react';

import { distances, type PoolCode } from '../../../core/sport';
import type { ManagedAthleteRepository } from '../../accounts';
import { importedAchievement, latestAchievement, type ImportedHistoryResult } from '../achievements';
import { athleteDisplay } from '../athleteDisplay';
import { strokeLabel } from '../components/sportLabel';
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
  // Official results imported from the source, read from the device. They count as races in the marks, together with the measured times.
  importedResults?: { listByAthlete(athleteId: string): Promise<ImportedHistoryResult[]> };
  // The organization behind each import provider, from data; an unknown one shows as plain "Oficial".
  sourceNames?: Readonly<Record<string, string>>;
  // Changing it looks the athletes and their history up again (the route passes the last sync).
  refreshKey?: unknown;
  scrollEnabled?: boolean;
};

type Read = { athleteId: string; attempt: number; result: { measured: HistoryMeasurement[]; imported: ImportedHistoryResult[] } | 'error' };

const day = (iso: string) => iso.slice(0, 10);

// Connects the screen to the athletes the user manages and the local history of the one chosen, measured and imported. The pool filter is applied here, on what the device holds.
export function MarksContainer({ userId, managed, athletes, history, importedResults, sourceNames, refreshKey, scrollEnabled }: MarksContainerProps) {
  const result = useManagedAthletes(managed, athletes, userId, refreshKey);
  const selfId = useSelfAthleteId(managed, userId, refreshKey);
  const [chosenId, setChosenId] = useState<string>();
  const [chosenPool, setChosenPool] = useState<PoolCode>();
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<Read>();

  // The user's own athlete goes first, as in "Mis deportistas"; a choice no longer among the athletes falls back to the first.
  const list = result.status === 'ready' ? [...result.athletes.filter((a) => a.id === selfId), ...result.athletes.filter((a) => a.id !== selfId)] : [];
  const selected = list.find((a) => a.id === chosenId) ?? list[0];
  const selectedId = selected?.id;

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    Promise.all([history.listByAthlete(selectedId), importedResults?.listByAthlete(selectedId) ?? []]).then(
      ([measured, imported]) => active && setRead({ athleteId: selectedId, attempt, result: { measured, imported } }),
      () => active && setRead({ athleteId: selectedId, attempt, result: 'error' }),
    );
    return () => {
      active = false;
    };
  }, [history, importedResults, selectedId, attempt, refreshKey]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  let view: MarksView;
  if (result.status === 'loading') view = { kind: 'loading' };
  else if (!selected) view = { kind: 'empty' };
  else if (read?.athleteId !== selected.id || read.attempt !== attempt) view = { kind: 'loading' };
  else if (read.result === 'error') view = { kind: 'error', onRetry: retry };
  else {
    const achievements = [...read.result.measured, ...read.result.imported.map((r) => importedAchievement(r, sourceNames?.[r.provider]))];
    // Without a choice the screen opens in the pool of the most recent result; with no results at all, as before, in the short one.
    const pool = chosenPool ?? latestAchievement(achievements)?.pool ?? 'SCM';
    view = {
      kind: 'data',
      athletes: list.map((a) => {
        const { shortName, initials, color } = athleteDisplay(a);
        return { id: a.id, name: shortName, initials, color };
      }),
      selectedId: selected.id,
      firstName: selected.firstName,
      pool,
      cards: marksByEvent(achievements, pool).map(({ id, stroke, distance, best }) => ({
        id,
        event: `${strokeLabel(stroke)} ${distances.find((d) => d.code === distance)?.meters ?? distance}`,
        time: best?.hundredths ?? null,
        // Same rule as the profile: an imported result is official, a measured race is a competition, any other eligible kind is training.
        ...(best
          ? {
              origin: best.origin === 'import' ? ('official' as const) : best.kind === 'race' ? ('competition' as const) : ('training' as const),
              ...(best.sourceName ? { sourceName: best.sourceName } : {}),
              date: day(best.date),
            }
          : {}),
      })),
    };
  }
  return <MarksScreen view={view} onSelectAthlete={setChosenId} onPoolChange={setChosenPool} scrollEnabled={scrollEnabled} />;
}
