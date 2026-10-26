import { useEffect, useMemo, useState } from 'react';

import { t } from '../../../core/i18n';
import { useRecordSyncStates, type RecordSyncState, type SyncConnection } from '../../../core/sync';
import '../i18n';
import type { MeasurementFilterId } from '../components/athleteTypes';
import { eventLabel } from '../components/eventLabel';
import { localDate, localDateTime } from '../components/formatDate';
import type { MeasurementEntry } from '../components/MeasurementLog';
import type { CategoriesRepository } from '../data/categories';
import {
  filterMeasurements,
  measurementFilterOptions,
  shortId,
  type LogMeasurement,
  type MeasurementFilters,
  type MeasurementLogRepository,
} from '../data/measurementLog';
import type { ConsoleSectionProps } from './ConsoleScreen';
import { MeasurementsScreen, type MeasurementsView } from './MeasurementsScreen';

export type MeasurementsSectionProps = ConsoleSectionProps & {
  schoolId: string;
  repository: MeasurementLogRepository;
  categories: CategoriesRepository;
  // Everything is read again when this changes (a sync completed).
  refreshKey?: unknown;
  // When the local database last finished a sync; `null` when it never did.
  lastSyncedAt: Date | null;
  // 'connecting' is not 'offline': PowerSync is still reaching the backend, so nothing says the device lacks a network yet.
  connection: SyncConnection;
  // The clock. A stable function: the date ranges and the caption are computed again when it changes.
  now?: () => Date;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

type Loaded = { measurements: LogMeasurement[]; categoryNames: Map<string, string> };
// The answer is stored with what it answers, so another school or a retry never inherits it while its own read runs.
type Answer = { key: string; result: Loaded | 'error' };

const PAGE_SIZE = 50;
const MINUTE_MS = 60_000;
const defaultNow = () => new Date();

// Author and device are short ids until their names are readable (issue 220); a missing time stays null, never 0.
export function toEntry(m: LogMeasurement, sync?: RecordSyncState): MeasurementEntry {
  return {
    id: m.id,
    athlete: m.athlete,
    initials: m.initials,
    color: m.color,
    event: eventLabel(m.stroke, m.distance),
    kind: t(`schoolConsole.measurements.kind.${m.kind}`),
    versions: [{ time: m.time, author: shortId(m.authorId), device: shortId(m.deviceId), at: localDateTime(new Date(m.capturedAt)) }],
    sync,
  };
}

// The chronological log of the school's measurements, read from the local database. Owns the search, the filters and the page.
export function MeasurementsSection({
  width,
  schoolName,
  onNavigate,
  scrollEnabled,
  schoolId,
  repository,
  categories,
  refreshKey,
  lastSyncedAt,
  connection,
  now = defaultNow,
}: MeasurementsSectionProps) {
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<MeasurementFilters>({});
  const [sheetId, setSheetId] = useState<MeasurementFilterId | null>(null);
  const [pages, setPages] = useState(1);
  const [answer, setAnswer] = useState<Answer>();

  const key = `${schoolId}|${attempt}|${String(refreshKey)}`;
  useEffect(() => {
    let active = true;
    const settle = (result: Answer['result']) => active && setAnswer({ key, result });
    Promise.all([repository.list(schoolId), categories.list(schoolId)])
      .then(([measurements, list]) => settle({ measurements, categoryNames: new Map(list.map((c) => [c.id, c.name])) }))
      .catch(() => settle('error'));
    return () => {
      active = false;
    };
  }, [repository, categories, schoolId, key]);

  const loaded = answer?.key === key ? answer.result : undefined;
  const measurements = loaded === undefined || loaded === 'error' ? undefined : loaded.measurements;
  // The sync state of every measurement, one watched read: it gives the page its pills and the caption its conflict count.
  const states = useRecordSyncStates('measurements', useMemo(() => measurements?.map((m) => m.id) ?? [], [measurements]));
  const options = useMemo(() => (loaded && loaded !== 'error' ? measurementFilterOptions(loaded.measurements, loaded.categoryNames) : undefined), [loaded]);

  const change = (next: MeasurementFilters) => {
    setFilters(next);
    setPages(1);
  };

  let view: MeasurementsView;
  // Empty before the first sync arrives is not "no measurements": the data may still be on its way.
  if (loaded === undefined || (connection === 'connecting' && lastSyncedAt === null && loaded !== 'error' && loaded.measurements.length === 0)) {
    view = { kind: 'loading' };
  } else if (loaded === 'error') {
    view = { kind: 'error', onRetry: () => setAttempt((n) => n + 1) };
  } else if (loaded.measurements.length === 0) {
    view = connection === 'offline' && lastSyncedAt === null ? { kind: 'offline-empty' } : { kind: 'empty' };
  } else {
    const matching = filterMeasurements(loaded.measurements, query, filters, now());
    const shown = matching.slice(0, pages * PAGE_SIZE);
    const content = {
      updatedMinutesAgo: lastSyncedAt ? Math.max(0, Math.floor((now().getTime() - lastSyncedAt.getTime()) / MINUTE_MS)) : null,
      query,
      filters: Object.fromEntries(
        Object.entries(filters).map(([id, value]) => [id, options?.[id as MeasurementFilterId].find((o) => o.id === value)?.label ?? t('schoolConsole.common.no_data')]),
      ),
      entries: shown.map((m) => toEntry(m, states.get(m.id))),
      total: matching.length,
      conflicts: matching.filter((m) => states.get(m.id) === 'needs_review').length,
      onShowMore: shown.length < matching.length ? () => setPages((n) => n + 1) : undefined,
    };
    // Without a connection the log is what the device stored; with no sync date the banner leaves the date out.
    view = connection === 'offline' ? { kind: 'offline', storedOn: lastSyncedAt ? localDate(lastSyncedAt) : '', content } : { kind: 'data', content };
  }

  return (
    <MeasurementsScreen
      width={width}
      schoolName={schoolName}
      scrollEnabled={scrollEnabled}
      view={view}
      onNavigate={onNavigate}
      onQueryChange={(next) => {
        setQuery(next);
        setPages(1);
      }}
      onFilterPress={(id) => {
        if (filters[id] === undefined) return setSheetId(id);
        change(Object.fromEntries(Object.entries(filters).filter(([other]) => other !== id)));
      }}
      filterSheet={
        sheetId && options
          ? {
              id: sheetId,
              options: options[sheetId],
              selectedId: filters[sheetId],
              onChoose: (optionId) => {
                change({ ...filters, [sheetId]: optionId });
                setSheetId(null);
              },
              onClose: () => setSheetId(null),
            }
          : undefined
      }
    />
  );
}
