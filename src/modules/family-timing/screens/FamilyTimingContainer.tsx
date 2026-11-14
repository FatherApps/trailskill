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
import { localDay } from '../domain/localDay';
import { officialValue, type OfficialImport } from '../domain/officialValue';
import { parseTimeEntry } from '../domain/timeEntry';
import { FamilyTimingScreen, type FamilyCard, type FamilyTimingView } from './FamilyTimingScreen';
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

type Setup = { stroke: StrokeCode; distance: DistanceCode; pool: PoolCode; sessionType: FamilySessionType; competition: string };
const initialSetup: Setup = { stroke: strokes[0].code, distance: distances[1].code, pool: pools[0].code, sessionType: 'training', competition: '' };

type Step =
  | { kind: 'list' }
  | { kind: 'setup' }
  | { kind: 'stopwatch'; saveError: boolean }
  | { kind: 'official'; id: string; text: string; invalid: boolean };

// `key` is the athlete and reload count it was read for: a read for another key is still loading.
type Loaded =
  | { status: 'loading' }
  | { status: 'error'; key: string }
  | { status: 'ready'; key: string; measurements: FamilyMeasurement[]; imported: OfficialImport[] };

function buttonsHint(startKey: number, splitKey: number, keyboard: string | undefined) {
  const keysLine =
    startKey === splitKey
      ? t('family_timing.stopwatch.buttons_start_only', { start: keyName(startKey) })
      : t('family_timing.stopwatch.buttons', { start: keyName(startKey), split: keyName(splitKey) });
  return keyboard ? `${t('family_timing.stopwatch.buttons_device', { device: keyboard })} · ${keysLine}` : keysLine;
}

const eventLabel = (m: { stroke: string; distance: string; pool: string }) =>
  `${t(`sport.stroke.${m.stroke}`)} ${t(`sport.distance.${m.distance}`)} · ${t(`sport.pool.${m.pool}`)}`;

// Container: reads and writes the guardian's own times on this phone, and runs the stopwatch.
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
  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [stopwatch, setStopwatch] = useState<FamilyStopwatch>(idleFamilyStopwatch);
  const [tick, setTick] = useState(0);
  const saving = useRef(false);

  // A key press acts on the stopwatch as it is at that instant, not as it was at the last render.
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
      const next = action === 'start' ? startAt : action === 'split' ? splitAt : stopAt;
      latestStopwatch.current = next(latestStopwatch.current, at);
      setStopwatch(latestStopwatch.current);
    },
  });

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const readKey = `${selectedId}:${reload}`;
    // An unreadable import list only hides the imported official values; the guardian's own times still show.
    const officialRead = imports ? imports.listByAthlete(selectedId).catch(() => []) : Promise.resolve([]);
    Promise.all([repository.listByAthlete(selectedId), officialRead])
      .then(([measurements, imported]) => active && setRead({ status: 'ready', key: readKey, measurements, imported }))
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

  const cards = useMemo<FamilyCard[]>(() => {
    if (loaded.status !== 'ready') return [];
    return loaded.measurements.map((m) => {
      const day = localDay(m.capturedAt);
      const date = formatDate(day, 'short') ?? day;
      const type = t(`family_timing.session_type.${m.sessionType}`);
      const value = officialValue(m, loaded.imported);
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
        splitsLabel: m.splits.length > 0 ? t('family_timing.card.splits', { count: m.splits.length }) : null,
        canSetOfficial: m.sessionType === 'competition' && value?.kind !== 'imported',
        hasManualOfficial: m.officialMillis !== null,
      };
    });
  }, [loaded, format, sourceNames]);

  const goToList = () => {
    setStep({ kind: 'list' });
    setStopwatch(idleFamilyStopwatch);
  };

  async function save() {
    if (saving.current || stopwatch.status !== 'stopped' || !selectedId) return;
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

  const option = (code: string, nameKey: string) => ({ value: code, label: t(nameKey) });
  let view: FamilyTimingView;
  if (athletes.length === 0) view = { kind: 'no_athletes' };
  else if (step.kind === 'setup')
    view = {
      kind: 'setup',
      setup: {
        stroke: { options: strokes.map((s) => option(s.code, s.nameKey)), value: setup.stroke },
        distance: { options: distances.map((d) => option(d.code, d.nameKey)), value: setup.distance },
        pool: { options: pools.map((p) => option(p.code, p.nameKey)), value: setup.pool },
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
        splits: splitMillis(stopwatch).map(format),
        event: eventLabel(setup),
        noTime: stopwatch.status === 'stopped' && finalMillis(stopwatch) === null,
        buttonsHint: keys.active ? buttonsHint(buttonPrefs.startKey, buttonPrefs.splitKey, keys.keyboards[0]?.name) : null,
      },
    };
  } else if (step.kind === 'official') {
    const card = cards.find((c) => c.id === step.id);
    view = card ? { kind: 'official', card, text: step.text, invalid: step.invalid } : { kind: 'list', cards };
  } else if (loaded.status === 'loading') view = { kind: 'loading' };
  else if (loaded.status === 'error') view = { kind: 'error' };
  else view = { kind: 'list', cards };

  return (
    <FamilyTimingScreen
      view={view}
      athletes={athletes.map((a) => {
        const { shortName, initials, color } = athleteDisplay(a);
        return { id: a.id, name: shortName, initials, color };
      })}
      selectedId={selectedId}
      onSelectAthlete={setChosenId}
      onBack={onBack}
      onRetry={() => setReload((n) => n + 1)}
      onNew={() => setStep({ kind: 'setup' })}
      onSetupChange={(field, value) => setSetup((current) => ({ ...current, [field]: value }))}
      onGoToStopwatch={() => {
        setStopwatch(idleFamilyStopwatch);
        setStep({ kind: 'stopwatch', saveError: false });
      }}
      onCancel={goToList}
      onStart={() => setStopwatch((sw) => startAt(sw, now()))}
      onSplit={() => setStopwatch((sw) => splitAt(sw, now()))}
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
    />
  );
}
