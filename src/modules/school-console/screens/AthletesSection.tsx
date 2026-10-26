import { useEffect, useMemo, useState } from 'react';

import { t } from '../../../core/i18n';
import type { SyncConnection } from '../../../core/sync';
import '../i18n';
import type { AthleteBest, AthleteFilterId, AthleteRow, CategoryChoice } from '../components/athleteTypes';
import { personalBestLabel } from '../components/eventLabel';
import { localDate } from '../components/formatDate';
import type { CategoriesRepository, Category } from '../data/categories';
import { athleteIndicators, filterAthletes, filterOptions, startOfWeek } from '../data/athletesList';
import { CONSOLE_BEST_EVENT, type ConsoleAthlete, type ConsoleAthletesRepository } from '../data/consoleAthletes';
import { AthletesScreen, type AthletesContent, type AthletesView } from './AthletesScreen';
import type { ConsoleSectionProps } from './ConsoleScreen';

export type AthletesSectionProps = ConsoleSectionProps & {
  schoolId: string;
  repository: ConsoleAthletesRepository;
  // Without it the detail shows the category but cannot change it.
  categories?: CategoriesRepository;
  // The list is read again when this changes (a sync completed).
  refreshKey?: unknown;
  // When the local database last finished a sync; `null` when it never did.
  lastSyncedAt: Date | null;
  // 'connecting' is not 'offline': PowerSync is still reaching the backend, so nothing says the device lacks a network yet.
  connection: SyncConnection;
  // The clock. A stable function: the list is read again when it changes.
  now?: () => Date;
};

type Loaded = { athletes: ConsoleAthlete[]; measurementsThisWeek: number };
// The answer is stored with what it answers, so another school or a retry never inherits it while its own read runs.
type Answer = { schoolId: string; attempt: number; result: Loaded | 'error' };
type Filters = Partial<Record<AthleteFilterId, string>>;

const defaultNow = () => new Date();

const MINUTE_MS = 60_000;

const ASSIGN_ERRORS = ['category_inactive', 'category_wrong_school', 'category_missing', 'athlete_school_missing'];
// The message of a failed assignment: the repository's own error code when it has a text, a generic one otherwise.
const assignError = (error: unknown) => {
  const code = error instanceof Error && ASSIGN_ERRORS.includes(error.message) ? error.message : 'other';
  return t(`schoolConsole.detail.category_error.${code}`);
};

// What the admin can pick: the active categories, the one the athlete has even if inactive, and none.
function categoryOptions(list: Category[], current: string | null): CategoryChoice['options'] {
  return [
    ...list
      .filter((category) => category.active || category.id === current)
      .map((category) => ({
        id: category.id,
        label: category.active ? category.name : t('schoolConsole.detail.inactive_option', { name: category.name }),
      })),
    { id: null, label: t('schoolConsole.detail.no_category') },
  ];
}

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
  categories,
  refreshKey,
  lastSyncedAt,
  connection,
  now = defaultNow,
}: AthletesSectionProps) {
  const [answer, setAnswer] = useState<Answer>();
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [sheetId, setSheetId] = useState<AthleteFilterId | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  // Bumped after each assignment so the list and the tags show the new category.
  const [version, setVersion] = useState(0);
  const [assignFailure, setAssignFailure] = useState<{ athleteId: string; message: string }>();
  const [bests, setBests] = useState<{ athleteId: string; bests: AthleteBest[]; failed: boolean }>();

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
  }, [repository, schoolId, refreshKey, attempt, now, version]);

  useEffect(() => {
    if (!categories) return;
    let active = true;
    categories.list(schoolId).then((list) => active && setCategoryList(list), () => active && setCategoryList([]));
    return () => {
      active = false;
    };
  }, [categories, schoolId, refreshKey, version]);

  useEffect(() => {
    if (selectedId === null) return;
    let active = true;
    const settle = (list: AthleteBest[], failed = false) => active && setBests({ athleteId: selectedId, bests: list, failed });
    repository.listBests(selectedId).then((list) => settle(list), () => settle([], true));
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
    // Never synced and still not connected: nothing is stored yet, and the list fills in when the first sync arrives.
    view = connection !== 'connected' && lastSyncedAt === null ? { kind: 'offline-empty' } : { kind: 'empty' };
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
            bestsError: bests?.athleteId === selected.id && bests.failed,
            categoryChoice: categories && {
              options: categoryOptions(categoryList, selected.categoryId),
              selectedId: selected.categoryId,
              error: assignFailure?.athleteId === selected.id ? assignFailure.message : null,
              onChoose: (categoryId) =>
                categories.assignAthlete(selected.id, schoolId, categoryId).then(
                  () => {
                    setAssignFailure(undefined);
                    setVersion((n) => n + 1);
                  },
                  (error) => setAssignFailure({ athleteId: selected.id, message: assignError(error) }),
                ),
            },
          }
        : null,
    };
    // Without a connection the list is what the device stored; with no sync date the banner leaves the date out.
    view = connection !== 'offline' ? { kind: 'data', content } : { kind: 'offline', storedOn: lastSyncedAt ? localDate(lastSyncedAt) : '', content };
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
