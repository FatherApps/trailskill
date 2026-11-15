import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '../../../core/i18n';
import { usePreferences } from '../../../core/preferences';
import { distances, pools, strokes, type DistanceCode, type PoolCode, type StrokeCode } from '../../../core/sport';
import { formatMillis, formatTime } from '../../../core/time';
import { athleteDisplay, formatDate, type SchoolAthlete } from '../../athletes';
import { keyName, nanosFromSeconds, timingButton, useTimingButtons, type ButtonTarget, type TimingButtonPort } from '../../timing';
import type { FamilyMeasurement, FamilyMeasurementRepository, FamilySessionType } from '../data/familyMeasurements';
import {
  elapsedMillisAt,
  finalMillis,
  idleFamilyStopwatch,
  splitAt,
  splitMillis,
  startAt,
  stopAt,
  type FamilyStopwatch,
} from '../domain/familyStopwatch';
import { bestTimeIds } from '../domain/bestTimes';
import { lapsFor } from '../domain/laps';
import { localDay } from '../domain/localDay';
import { officialValue, type OfficialImport } from '../domain/officialValue';
import { parseTimeEntry } from '../domain/timeEntry';
import {
  FamilyTimingScreen,
  type FamilyCard,
  type FamilyDeletedCard,
  type FamilyFilterKey,
  type FamilyFiltersView,
  type FamilyTimingView,
} from './FamilyTimingScreen';
import '../i18n';

const KEEP_AWAKE_TAG = 'family-timing';

export type FamilyTimingContainerProps = {
  userId: string;
  athletes: SchoolAthlete[];
  repository: FamilyMeasurementRepository;
  onBack: () => void;
  // The athlete's imported official results (results-import); a matching one becomes the official value of a competition time.
  imports?: { listByAthlete(athleteId: string): Promise<OfficialImport[]> };
  // Organization names by provider, from data; without one the official tag is generic.
  sourceNames?: Record<string, string>;
  // The headset or volume keys (Ajustes, "Botones para cronometrar"); injected by tests.
  buttons?: TimingButtonPort;
  // Injected by tests; otherwise the buttons' clock, so a touch and a key press share one time base.
  now?: () => bigint;
};

const targetOf = (sw: FamilyStopwatch): ButtonTarget => (sw.status === 'running' ? { status: 'running', startedAt: sw.startedAt } : { status: sw.status });

// The pool starts unchosen: the laps depend on it, so the stopwatch waits until the person picks one.
type Setup = { stroke: StrokeCode; distance: DistanceCode; pool: PoolCode | null; sessionType: FamilySessionType; competition: string };
const initialSetup: Setup = { stroke: strokes[0].code, distance: distances[1].code, pool: null, sessionType: 'training', competition: '' };

type Step =
  | { kind: 'list' }
  | { kind: 'setup' }
  | { kind: 'stopwatch'; saveError: boolean }
  | { kind: 'official'; id: string; text: string; invalid: boolean }
  | { kind: 'edit'; id: string; stroke: StrokeCode; athleteId: string; confirmingDelete: boolean; saveError: boolean }
  | { kind: 'deleted'; restoreError: boolean };

// A deleted time is removed from the server this long after it was deleted.
const KEEP_DELETED_DAYS = 30;

type Filters = Record<FamilyFilterKey, string>;
const noFilters: Filters = { sessionType: '', stroke: '', distance: '', pool: '' };

/**
 * The lap rows: each finished lap's own time and the total at its end. The last lap ends at the stop, so once stopped it is
 * a row too (null times stay null, never 0).
 */
function lapRows(splits: number[], final: number | null, hasLaps: boolean): { lap: number | null; total: number | null }[] {
  if (!hasLaps) return [];
  const ends: (number | null)[] = splits.length > 0 && final !== null ? [...splits, final] : [...splits];
  return ends.map((total, index) => {
    const previous = index === 0 ? 0 : ends[index - 1];
    return { lap: total !== null && previous !== null ? total - previous : null, total };
  });
}

// `key` is the athlete and reload count it was read for: a read for another key is still loading.
type Loaded =
  | { status: 'loading' }
  | { status: 'error'; key: string }
  | { status: 'ready'; key: string; measurements: FamilyMeasurement[]; deleted: FamilyMeasurement[]; imported: OfficialImport[] };

function buttonsHint(startKey: number, splitKey: number, keyboard: string | undefined) {
  const keysLine =
    startKey === splitKey
      ? t('family_timing.stopwatch.buttons_start_only', { start: keyName(startKey) })
      : t('family_timing.stopwatch.buttons', { start: keyName(startKey), split: keyName(splitKey) });
  return keyboard ? `${t('family_timing.stopwatch.buttons_device', { device: keyboard })} · ${keysLine}` : keysLine;
}

const eventLabel = (m: { stroke: string; distance: string; pool: string }) =>
  `${t(`sport.stroke.${m.stroke}`)} ${t(`sport.distance.${m.distance}`)} · ${t(`sport.pool.${m.pool}`)}`;

// Container: reads and writes the guardian's own times (kept on the server for them), and runs the stopwatch.
export function FamilyTimingContainer(props: FamilyTimingContainerProps) {
  const { userId, athletes, repository, onBack, imports, sourceNames = {}, buttons = timingButton } = props;
  const now = props.now ?? buttons.now;
  const { preferences } = usePreferences();
  const buttonPrefs = preferences.timingButtons;
  const precision = preferences.timePrecision;
  const format = useCallback((millis: number | null) => formatMillis(millis, { precision }), [precision]);

  const [chosenId, setChosenId] = useState<string | null>(null);
  const selectedId = athletes.some((a) => a.id === chosenId) ? chosenId : (athletes[0]?.id ?? null);
  const [read, setRead] = useState<Loaded>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const key = `${selectedId}:${reload}`;
  const loaded = useMemo<Loaded>(() => (read.status !== 'loading' && read.key === key ? read : { status: 'loading' }), [read, key]);
  const [step, setStep] = useState<Step>({ kind: 'list' });
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [stopwatch, setStopwatch] = useState<FamilyStopwatch>(idleFamilyStopwatch);
  const [tick, setTick] = useState(0);
  const saving = useRef(false);

  // A key press acts on the stopwatch as it is at that instant, not as it was at the last render.
  const laps = setup.pool ? lapsFor(setup.distance, setup.pool) : 1;
  const latestStopwatch = useRef(stopwatch);
  useEffect(() => {
    latestStopwatch.current = stopwatch;
  });
  const keys = useTimingButtons({
    enabled: buttonPrefs.enabled && step.kind === 'stopwatch',
    config: { startKey: buttonPrefs.startKey, splitKey: buttonPrefs.splitKey, lockoutNanos: nanosFromSeconds(buttonPrefs.lockoutSeconds) },
    target: () => targetOf(latestStopwatch.current),
    vibrate: buttonPrefs.vibrate,
    port: buttons,
    onAction: (action, at) => {
      const sw = latestStopwatch.current;
      latestStopwatch.current = action === 'start' ? startAt(sw, at) : action === 'split' ? splitAt(sw, at, laps) : stopAt(sw, at);
      setStopwatch(latestStopwatch.current);
    },
  });

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const readKey = `${selectedId}:${reload}`;
    // An unreadable import list only hides the imported official values; the guardian's own times still show.
    const officialRead = imports ? imports.listByAthlete(selectedId).catch(() => []) : Promise.resolve([]);
    Promise.all([repository.listByAthlete(selectedId), repository.listDeleted(selectedId), officialRead])
      .then(([measurements, deleted, imported]) => active && setRead({ status: 'ready', key: readKey, measurements, deleted, imported }))
      .catch(() => active && setRead({ status: 'error', key: readKey }));
    return () => {
      active = false;
    };
  }, [repository, imports, selectedId, reload]);

  // The screen stays awake and the time refreshes while the stopwatch runs.
  const running = stopwatch.status === 'running';
  useEffect(() => {
    if (!running) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    const timer = setInterval(() => setTick((n) => n + 1), 47);
    return () => {
      clearInterval(timer);
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [running]);

  const cardOf = useCallback(
    (m: FamilyMeasurement, imported: OfficialImport[]): FamilyCard => {
      const day = localDay(m.capturedAt);
      const date = formatDate(day, 'short') ?? day;
      const type = t(`family_timing.session_type.${m.sessionType}`);
      const value = officialValue(m, imported);
      const organization = value?.kind === 'imported' ? sourceNames[value.provider] : undefined;
      // An imported time was published in hundredths: it is shown as published, never padded to thousandths.
      const official =
        value?.kind === 'imported'
          ? {
              label: organization ? t('family_timing.card.official_imported', { organization }) : t('family_timing.card.official_imported_generic'),
              time: formatTime(value.hundredths),
            }
          : value?.kind === 'manual'
            ? { label: t('family_timing.card.official_manual'), time: format(value.millis) }
            : null;
      return {
        id: m.id,
        event: eventLabel(m),
        detail: [date, type, m.competition].filter(Boolean).join(' · '),
        captured: format(m.millis),
        capturedIsHistory: official !== null,
        official,
        splitsLabel: m.splits.length > 0 ? t('family_timing.card.splits', { count: m.splits.length + 1 }) : null,
        canSetOfficial: m.sessionType === 'competition' && value?.kind !== 'imported',
        hasManualOfficial: m.officialMillis !== null,
      };
    },
    [format, sourceNames],
  );
  const cards = useMemo<FamilyCard[]>(
    () => (loaded.status === 'ready' ? loaded.measurements.map((m) => cardOf(m, loaded.imported)) : []),
    [loaded, cardOf],
  );
  // The list: the times that pass the filters, with the best of each event marked. The official time, when there is one, is the record.
  const listed = useMemo(() => {
    if (loaded.status !== 'ready') return { cards: [], filters: null };
    const all = loaded.measurements;
    const shown = all.filter((m) => (Object.keys(filters) as FamilyFilterKey[]).every((key) => !filters[key] || m[key] === filters[key]));
    const best = bestTimeIds(
      shown.map((m) => {
        const value = officialValue(m, loaded.imported);
        const time = value?.kind === 'imported' ? value.hundredths * 10 : value?.kind === 'manual' ? value.millis : m.millis;
        return { id: m.id, stroke: m.stroke, distance: m.distance, pool: m.pool, capturedAt: m.capturedAt, time };
      }),
    );
    const byId = new Map(cards.map((c) => [c.id, c]));
    const present = (key: 'stroke' | 'distance' | 'pool', catalog: readonly { code: string; nameKey: string }[]) => ({
      options: [
        { value: '', label: t('family_timing.filters.all') },
        ...catalog.filter((entry) => all.some((m) => m[key] === entry.code)).map((entry) => ({ value: entry.code, label: t(entry.nameKey) })),
      ],
      value: filters[key],
    });
    const view: FamilyFiltersView = {
      sessionType: {
        options: [
          { value: '', label: t('family_timing.filters.all_types') },
          { value: 'training', label: t('family_timing.filters.training') },
          { value: 'competition', label: t('family_timing.filters.competition') },
        ],
        value: filters.sessionType,
      },
      stroke: present('stroke', strokes),
      distance: present('distance', distances),
      pool: present('pool', pools),
    };
    return {
      cards: shown.flatMap((m) => {
        const card = byId.get(m.id);
        return card ? [{ ...card, isBest: best.has(m.id) }] : [];
      }),
      filters: all.length > 0 ? view : null,
    };
  }, [loaded, cards, filters]);
  const deletedCards = useMemo<FamilyDeletedCard[]>(() => {
    if (loaded.status !== 'ready') return [];
    return loaded.deleted.map((m) => {
      const removed = new Date(Date.parse(m.deletedAt ?? m.capturedAt) + KEEP_DELETED_DAYS * 86_400_000).toISOString();
      const day = localDay(removed);
      return { ...cardOf(m, loaded.imported), removedOn: formatDate(day, 'short') ?? day };
    });
  }, [loaded, cardOf]);
  const listView = (): FamilyTimingView => ({
    kind: 'list',
    cards: listed.cards,
    deletedCount: deletedCards.length,
    filters: listed.filters,
    filtered: Object.values(filters).some(Boolean),
  });

  const goToList = () => {
    setStep({ kind: 'list' });
    setStopwatch(idleFamilyStopwatch);
  };

  async function save() {
    if (saving.current || stopwatch.status !== 'stopped' || !selectedId || !setup.pool) return;
    saving.current = true;
    const measurement: FamilyMeasurement = {
      id: randomUUID(),
      athleteId: selectedId,
      createdBy: userId,
      stroke: setup.stroke,
      distance: setup.distance,
      pool: setup.pool,
      sessionType: setup.sessionType,
      competition: setup.sessionType === 'competition' && setup.competition.trim() ? setup.competition.trim() : null,
      capturedAt: new Date().toISOString(),
      millis: finalMillis(stopwatch),
      splits: splitMillis(stopwatch),
      officialMillis: null,
      officialSetAt: null,
    };
    try {
      await repository.add(measurement);
      goToList();
      setReload((n) => n + 1);
    } catch {
      setStep({ kind: 'stopwatch', saveError: true });
    } finally {
      saving.current = false;
    }
  }

  async function writeOfficial(id: string, millis: number | null) {
    try {
      await repository.setOfficial(id, millis, new Date().toISOString());
      setStep({ kind: 'list' });
      setReload((n) => n + 1);
    } catch {
      setRead({ status: 'error', key });
      setStep({ kind: 'list' });
    }
  }

  async function change(write: () => Promise<void>, onError: () => void, next: Step = { kind: 'list' }) {
    if (saving.current) return;
    saving.current = true;
    try {
      await write();
      setStep(next);
      setReload((n) => n + 1);
    } catch {
      onError();
    } finally {
      saving.current = false;
    }
  }

  const athleteOptions = athletes.map((a) => {
    const { shortName, initials, color } = athleteDisplay(a);
    return { value: a.id, label: shortName, dot: { initials, color } };
  });

  const option = (code: string, nameKey: string) => ({ value: code, label: t(nameKey) });
  let view: FamilyTimingView;
  if (athletes.length === 0) view = { kind: 'no_athletes' };
  else if (step.kind === 'setup')
    view = {
      kind: 'setup',
      setup: {
        stroke: { options: strokes.map((s) => option(s.code, s.nameKey)), value: setup.stroke },
        distance: { options: distances.map((d) => option(d.code, d.nameKey)), value: setup.distance },
        pool: { options: pools.map((p) => option(p.code, p.nameKey)), value: setup.pool ?? '' },
        sessionType: {
          options: (['training', 'competition'] as const).map((type) => ({ value: type, label: t(`family_timing.session_type.${type}`) })),
          value: setup.sessionType,
        },
        competition: setup.competition,
      },
    };
  else if (step.kind === 'stopwatch') {
    void tick;
    const elapsed = elapsedMillisAt(stopwatch, now());
    view = {
      kind: 'stopwatch',
      saveError: step.saveError,
      stopwatch: {
        status: stopwatch.status,
        time: stopwatch.status === 'idle' ? format(0) : format(elapsed),
        laps: lapRows(splitMillis(stopwatch), finalMillis(stopwatch), laps > 1).map(({ lap, total }) => ({ lap: format(lap), total: format(total) })),
        lapProgress:
          laps > 1 && stopwatch.status === 'running'
            ? t('family_timing.stopwatch.lap_progress', { current: stopwatch.splitMarks.length + 1, total: laps })
            : null,
        hasLaps: laps > 1,
        event: eventLabel({ ...setup, pool: setup.pool ?? '' }),
        noTime: stopwatch.status === 'stopped' && finalMillis(stopwatch) === null,
        buttonsHint: keys.active ? buttonsHint(buttonPrefs.startKey, buttonPrefs.splitKey, keys.keyboards[0]?.name) : null,
      },
    };
  } else if (step.kind === 'official') {
    const card = cards.find((c) => c.id === step.id);
    view = card ? { kind: 'official', card, text: step.text, invalid: step.invalid } : listView();
  } else if (loaded.status === 'loading') view = { kind: 'loading' };
  else if (loaded.status === 'error') view = { kind: 'error' };
  else if (step.kind === 'edit') {
    const card = cards.find((c) => c.id === step.id);
    view = card
      ? {
          kind: 'edit',
          edit: {
            card,
            stroke: { options: strokes.map((s) => option(s.code, s.nameKey)), value: step.stroke },
            athlete: { options: athleteOptions, value: step.athleteId },
            confirmingDelete: step.confirmingDelete,
            saveError: step.saveError,
          },
        }
      : listView();
  } else if (step.kind === 'deleted') view = { kind: 'deleted', cards: deletedCards, restoreError: step.restoreError };
  else view = listView();

  return (
    <FamilyTimingScreen
      view={view}
      athletes={athleteOptions.map(({ value, label, dot }) => ({ id: value, name: label, ...dot }))}
      selectedId={selectedId}
      onSelectAthlete={setChosenId}
      onBack={onBack}
      onRetry={() => setReload((n) => n + 1)}
      onNew={() => setStep({ kind: 'setup' })}
      onSetupChange={(field, value) => setSetup((current) => ({ ...current, [field]: value }))}
      onGoToStopwatch={() => {
        if (!setup.pool) return;
        setStopwatch(idleFamilyStopwatch);
        setStep({ kind: 'stopwatch', saveError: false });
      }}
      onCancel={goToList}
      onStart={() => setStopwatch((sw) => startAt(sw, now()))}
      onSplit={() => setStopwatch((sw) => splitAt(sw, now(), laps))}
      onStop={() => setStopwatch((sw) => stopAt(sw, now()))}
      onSave={save}
      onDiscard={goToList}
      onOpenOfficial={(id) => {
        const m = loaded.status === 'ready' ? loaded.measurements.find((x) => x.id === id) : undefined;
        setStep({ kind: 'official', id, text: m?.officialMillis != null ? formatMillis(m.officialMillis, { precision: 'thousandths' }) : '', invalid: false });
      }}
      onOfficialText={(text) => setStep((s) => (s.kind === 'official' ? { ...s, text, invalid: false } : s))}
      onSaveOfficial={() => {
        if (step.kind !== 'official') return;
        const entry = parseTimeEntry(step.text);
        if (!entry.ok) setStep({ ...step, invalid: true });
        else writeOfficial(step.id, entry.value);
      }}
      onClearOfficial={() => step.kind === 'official' && writeOfficial(step.id, null)}
      onOpenEdit={(id) => {
        const m = loaded.status === 'ready' ? loaded.measurements.find((x) => x.id === id) : undefined;
        if (m) setStep({ kind: 'edit', id, stroke: m.stroke, athleteId: m.athleteId, confirmingDelete: false, saveError: false });
      }}
      onEditChange={(field, value) =>
        setStep((s) => (s.kind === 'edit' ? { ...s, saveError: false, ...(field === 'stroke' ? { stroke: value as StrokeCode } : { athleteId: value }) } : s))
      }
      onSaveEdit={() => {
        if (step.kind !== 'edit') return;
        const m = loaded.status === 'ready' ? loaded.measurements.find((x) => x.id === step.id) : undefined;
        if (!m) return;
        const changes = {
          ...(step.stroke !== m.stroke ? { stroke: step.stroke } : {}),
          ...(step.athleteId !== m.athleteId ? { athleteId: step.athleteId } : {}),
        };
        if (Object.keys(changes).length === 0) return goToList();
        // A time moved to another swimmer leaves this list: the list now shows that swimmer, where the time went.
        const moved = changes.athleteId;
        change(
          async () => {
            await repository.edit(step.id, changes);
            if (moved) setChosenId(moved);
          },
          () => setStep({ ...step, saveError: true }),
        );
      }}
      onAskDelete={() => setStep((s) => (s.kind === 'edit' ? { ...s, confirmingDelete: true } : s))}
      onCancelDelete={() => setStep((s) => (s.kind === 'edit' ? { ...s, confirmingDelete: false } : s))}
      onConfirmDelete={() => {
        if (step.kind !== 'edit') return;
        change(
          () => repository.remove(step.id, new Date().toISOString()),
          () => setStep({ ...step, confirmingDelete: false, saveError: true }),
        );
      }}
      onOpenDeleted={() => setStep({ kind: 'deleted', restoreError: false })}
      onFilter={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
      onRestore={(id) =>
        change(
          () => repository.restore(id),
          () => setStep({ kind: 'deleted', restoreError: true }),
          { kind: 'deleted', restoreError: false },
        )
      }
    />
  );
}
