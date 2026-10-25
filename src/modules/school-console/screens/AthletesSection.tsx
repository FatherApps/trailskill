import { useEffect, useMemo, useState } from 'react';

import { t } from '../../../core/i18n';
import '../i18n';
import type { AthleteBest, AthleteFilterId, AthleteRow } from '../components/athleteTypes';
import { personalBestLabel } from '../components/eventLabel';
import { athleteIndicators, filterAthletes, filterOptions, startOfWeek } from '../data/athletesList';
import { CONSOLE_BEST_EVENT, type ConsoleAthlete, type ConsoleAthletesRepository } from '../data/consoleAthletes';
import { AthletesScreen, type AthletesContent, type AthletesView } from './AthletesScreen';
import type { ConsoleSectionProps } from './ConsoleScreen';

export type AthletesSectionProps = ConsoleSectionProps & {
  schoolId: string;
  repository: ConsoleAthletesRepository;
  // The list is read again when this changes (a sync completed).
  refreshKey?: unknown;
  // When the local database last finished a sync; `null` when it never did.
  lastSyncedAt: Date | null;
  connected: boolean;
  // The clock. A stable function: the list is read again when it changes.
  now?: () => Date;
};

type Loaded = { athletes: ConsoleAthlete[]; measurementsThisWeek: number };
// The answer is stored with what it answers, so another school or a retry never inherits it while its own read runs.
type Answer = { schoolId: string; attempt: number; result: Loaded | 'error' };
type Filters = Partial<Record<AthleteFilterId, string>>;

const defaultNow = () => new Date();

const MINUTE_MS = 60_000;

// Local date as YYYY-MM-DD, the form the screen formats.
const localDate = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('-');

function toRow(athlete: ConsoleAthlete): AthleteRow {
  const noData = t('schoolConsole.common.no_data');
  return {
    id: athlete.id,
    name: athlete.name,
    initials: athlete.initials,
    color: athlete.color,
    category: athlete.category ?? noData,
    group: athlete.groups.length > 0 ? athlete.groups.join(', ') : noData,
    // Coach names arrive with issue 220: until then the cell says so.
    coach: null,
    authorization: athlete.authorization,
    bestTime: athlete.bestTime,
  };
}

// The athletes of the school, read from the local database. Owns the search, the filters and the open athlete.
export function AthletesSection({
  width,
  schoolName,
  onNavigate,
  schoolId,
  repository,
  refreshKey,
  lastSyncedAt,
  connected,
  now = defaultNow,
}: AthletesSectionProps) {
  const [answer, setAnswer] = useState<Answer>();
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [sheetId, setSheetId] = useState<AthleteFilterId | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bests, setBests] = useState<{ athleteId: string; bests: AthleteBest[] }>();

  useEffect(() => {
    let active = true;
    const settle = (result: Answer['result']) => active && setAnswer({ schoolId, attempt, result });
    repository
      .listAthletes(schoolId)
      .then(async (athletes) =>
        settle({ athletes, measurementsThisWeek: await repository.countMeasurementsSince(athletes.map((a) => a.id), startOfWeek(now())) }),
      )
      .catch(() => settle('error'));
    return () => {
      active = false;
    };
  }, [repository, schoolId, refreshKey, attempt, now]);

  useEffect(() => {
    if (selectedId === null) return;
    let active = true;
    const settle = (list: AthleteBest[]) => active && setBests({ athleteId: selectedId, bests: list });
    repository.listBests(selectedId).then(settle, () => settle([]));
    return () => {
      active = false;
    };
  }, [repository, selectedId, refreshKey]);

  const loaded = answer?.schoolId === schoolId && answer.attempt === attempt ? answer.result : undefined;
  const athletes = loaded === 'error' || loaded === undefined ? undefined : loaded.athletes;
  const options = useMemo(() => (athletes ? filterOptions(athletes) : undefined), [athletes]);
  const bestLabel = personalBestLabel(CONSOLE_BEST_EVENT.stroke, CONSOLE_BEST_EVENT.distance, CONSOLE_BEST_EVENT.pool);

  let view: AthletesView;
  if (loaded === undefined) {
    view = { kind: 'loading' };
  } else if (loaded === 'error') {
    view = { kind: 'error', onRetry: () => setAttempt((n) => n + 1) };
  } else if (loaded.athletes.length === 0) {
    view = !connected && lastSyncedAt === null ? { kind: 'offline-empty' } : { kind: 'empty' };
  } else {
    const selected = loaded.athletes.find((a) => a.id === selectedId);
    const content: AthletesContent = {
      updatedMinutesAgo: lastSyncedAt ? Math.max(0, Math.floor((now().getTime() - lastSyncedAt.getTime()) / MINUTE_MS)) : null,
      indicators: athleteIndicators(loaded.athletes, loaded.measurementsThisWeek),
      query,
      filters: Object.fromEntries(
        Object.entries(filters).map(([id, value]) => [
          id,
          options?.[id as AthleteFilterId].find((o) => o.id === value)?.label ?? t('schoolConsole.common.no_data'),
        ]),
      ),
      athletes: filterAthletes(loaded.athletes, query, filters).map(toRow),
      bestLabel,
      selectedId,
      detail: selected
        ? {
            id: selected.id,
            name: selected.name,
            category: selected.category ?? t('schoolConsole.common.no_data'),
            authorization: selected.authorization,
            // Guardians are not readable by school admins yet (S10, issue 220): never a guess.
            guardian: { name: null, contact: null },
            // Until the athlete's own bests arrive the list is empty, never another athlete's.
            bests: bests?.athleteId === selected.id ? bests.bests : [],
          }
        : null,
    };
    // Without a connection the list is what the device stored; with no sync date the banner leaves the date out.
    view = connected ? { kind: 'data', content } : { kind: 'offline', storedOn: lastSyncedAt ? localDate(lastSyncedAt) : '', content };
  }

  return (
    <AthletesScreen
      width={width}
      schoolName={schoolName}
      view={view}
      onNavigate={onNavigate}
      onQueryChange={setQuery}
      onFilterPress={(id) => {
        if (filters[id] === undefined) return setSheetId(id);
        setFilters((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
      }}
      onSelect={setSelectedId}
      onCloseDetail={() => setSelectedId(null)}
      onClearFilters={() => {
        setQuery('');
        setFilters({});
      }}
      filterSheet={
        sheetId && options
          ? {
              id: sheetId,
              options: options[sheetId],
              selectedId: filters[sheetId],
              onChoose: (optionId) => {
                setFilters((current) => ({ ...current, [sheetId]: optionId }));
                setSheetId(null);
              },
              onClose: () => setSheetId(null),
            }
          : undefined
      }
    />
  );
}
