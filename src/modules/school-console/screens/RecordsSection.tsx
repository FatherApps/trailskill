import { useEffect, useState } from 'react';

import { t } from '../../../core/i18n';
import { pools, type PoolCode } from '../../../core/sport';
import type { SyncConnection } from '../../../core/sync';
import '../i18n';
import type { RecordRow } from '../components/RecordTable';
import { eventLabel } from '../components/eventLabel';
import { localDate } from '../components/formatDate';
import type { CategoriesRepository, Category } from '../data/categories';
import type { CategoryRecord, CategoryRecordsRepository } from '../data/categoryRecords';
import type { SchoolGroup, SchoolStructureRepository } from '../data/schoolStructure';
import type { ConsoleSectionProps } from './ConsoleScreen';
import { RecordsScreen, type RecordsSheet, type RecordsView } from './RecordsScreen';

export type RecordsSectionProps = ConsoleSectionProps & {
  schoolId: string;
  repository: CategoryRecordsRepository;
  categories: CategoriesRepository;
  structure: Pick<SchoolStructureRepository, 'listGroups'>;
  // Everything is read again when this changes (a sync completed).
  refreshKey?: unknown;
  // When the local database last finished a sync; `null` when it never did.
  lastSyncedAt: Date | null;
  // 'connecting' is not 'offline': PowerSync is still reaching the backend, so nothing says the device lacks a network yet.
  connection: SyncConnection;
  // The clock. A stable function: the caption is computed again when it changes.
  now?: () => Date;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

type Structure = { categories: Category[]; groups: SchoolGroup[] };
// An answer is stored with what it answers, so another school, filter or retry never inherits it while its own read runs.
type Answer<T> = { key: string; result: T | 'error' };

const ALL_GROUPS = 'all';
const MINUTE_MS = 60_000;
const defaultNow = () => new Date();

// The records of one category in one pool, filtered by training group, read from the local database.
// Owns the three filters and the open selector. The category defaults to the first active one, the pool to the first of the catalog.
export function RecordsSection({
  width,
  schoolName,
  onNavigate,
  scrollEnabled,
  schoolId,
  repository,
  categories,
  structure,
  refreshKey,
  lastSyncedAt,
  connection,
  now = defaultNow,
}: RecordsSectionProps) {
  const [attempt, setAttempt] = useState(0);
  const [categoryId, setCategoryId] = useState<string>();
  const [groupId, setGroupId] = useState(ALL_GROUPS);
  const [pool, setPool] = useState<PoolCode>(pools[0].code);
  const [sheet, setSheet] = useState<'category' | 'group' | null>(null);
  const [loadedStructure, setLoadedStructure] = useState<Answer<Structure>>();
  const [loadedRecords, setLoadedRecords] = useState<Answer<CategoryRecord[]>>();

  const structureKey = `${schoolId}|${attempt}|${String(refreshKey)}`;
  useEffect(() => {
    let active = true;
    const settle = (result: Answer<Structure>['result']) => active && setLoadedStructure({ key: structureKey, result });
    Promise.all([categories.list(schoolId), structure.listGroups(schoolId)])
      .then(([list, groups]) => settle({ categories: list.filter((category) => category.active), groups }))
      .catch(() => settle('error'));
    return () => {
      active = false;
    };
  }, [categories, structure, schoolId, structureKey]);

  const known = loadedStructure?.key === structureKey ? loadedStructure.result : undefined;
  const options = known === 'error' ? undefined : known;
  // A category that was deactivated or removed meanwhile falls back to the first one.
  const category = options && (options.categories.find((c) => c.id === categoryId) ?? options.categories[0]);
  const group = options?.groups.find((g) => g.id === groupId);

  const recordsKey = `${structureKey}|${category?.id}|${group?.id}|${pool}`;
  useEffect(() => {
    if (!category) return;
    let active = true;
    const settle = (result: Answer<CategoryRecord[]>['result']) => active && setLoadedRecords({ key: recordsKey, result });
    repository
      .list({ schoolId, categoryId: category.id, pool, groupId: group?.id ?? null })
      .then(settle, () => settle('error'));
    return () => {
      active = false;
    };
    // `recordsKey` carries every input; the category is a new object on each read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, recordsKey]);

  const records = loadedRecords?.key === recordsKey ? loadedRecords.result : undefined;

  let view: RecordsView;
  if (known === 'error' || records === 'error') {
    view = { kind: 'error', onRetry: () => setAttempt((n) => n + 1) };
  } else if (options && options.categories.length === 0) {
    // Never synced: 'connecting' is not 'offline', the first sync is already on its way.
    view =
      lastSyncedAt !== null || connection === 'connected'
        ? { kind: 'empty' }
        : connection === 'connecting'
          ? { kind: 'connecting-empty' }
          : { kind: 'offline-empty' };
  } else if (!options || !category || records === undefined) {
    view = { kind: 'loading' };
  } else {
    const rows: RecordRow[] = records.map((record) => ({
      id: `${record.stroke}-${record.distance}`,
      pool,
      event: eventLabel(record.stroke, record.distance),
      time: record.time,
      athlete: record.athlete,
      date: record.date,
    }));
    const content = {
      updatedMinutesAgo: lastSyncedAt ? Math.max(0, Math.floor((now().getTime() - lastSyncedAt.getTime()) / MINUTE_MS)) : null,
      category: category.name,
      group: group?.name ?? t('schoolConsole.records.all_groups'),
      rows,
      pool,
    };
    // Without a connection the records are what the device stored; with no sync date the banner leaves the date out.
    view = connection === 'offline' ? { kind: 'offline', storedOn: lastSyncedAt ? localDate(lastSyncedAt) : '', content } : { kind: 'data', content };
  }

  let open: RecordsSheet | undefined;
  if (sheet === 'category' && options && category) {
    open = {
      label: t('schoolConsole.records.sheet.category'),
      options: options.categories.map((c) => ({ id: c.id, label: c.name })),
      selectedId: category.id,
      onChoose: (id) => {
        setCategoryId(id);
        setSheet(null);
      },
      onClose: () => setSheet(null),
    };
  } else if (sheet === 'group' && options) {
    open = {
      label: t('schoolConsole.records.sheet.group'),
      options: [{ id: ALL_GROUPS, label: t('schoolConsole.records.all_groups') }, ...options.groups.map((g) => ({ id: g.id, label: g.name }))],
      selectedId: group?.id ?? ALL_GROUPS,
      onChoose: (id) => {
        setGroupId(id);
        setSheet(null);
      },
      onClose: () => setSheet(null),
    };
  }

  return (
    <RecordsScreen
      width={width}
      schoolName={schoolName}
      scrollEnabled={scrollEnabled}
      view={view}
      onNavigate={onNavigate}
      onCategoryPress={() => setSheet('category')}
      onGroupPress={() => setSheet('group')}
      sheet={open}
      onPoolChange={setPool}
    />
  );
}
