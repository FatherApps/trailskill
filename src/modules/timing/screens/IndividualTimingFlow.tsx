import { randomUUID } from 'expo-crypto';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { t } from '../../../core/i18n';
import { distances, pools, strokes } from '../../../core/sport';
import { retryFailedRecord, useRecordSyncStates } from '../../../core/sync';
import { StateView } from '../../../core/ui';
import type { Hundredths } from '../../../core/time';
import type { Measurement, MeasurementRepository, SessionType } from '../data/measurements';
import { elapsedAt, idleStopwatch, reset, split, splitTimes, start, stop, totalTime, type Stopwatch } from '../domain/stopwatch';
import '../i18n';
import { StopwatchScreen } from './StopwatchScreen';
import { TimingSetupScreen, type SetupAthlete } from './TimingSetupScreen';
import { TimingSummaryScreen } from './TimingSummaryScreen';

// An athlete of the roster as the flow needs it. The container of the app builds it, so this module never reads another module's tables.
export type RosterAthlete = Pick<SetupAthlete, 'id' | 'shortName' | 'initials' | 'color' | 'authorized'>;

export type IndividualTimingFlowProps = {
  // For example the school name.
  subtitle: string;
  loadRoster: () => Promise<RosterAthlete[]>;
  measurements: MeasurementRepository;
  userId: string;
  deviceId: string;
  // Monotonic clock in nanoseconds; the stopwatch only uses differences.
  now?: () => bigint;
  offline?: boolean;
  onExit: () => void;
};

type Choice = { stroke: string; distance: string; pool: string; sessionType: SessionType };
type Saved = { id: string; athlete: RosterAthlete; time: Hundredths };
type Step =
  | { kind: 'setup' }
  | { kind: 'timing'; queue: RosterAthlete[]; position: number; saved: Saved[] }
  | { kind: 'summary'; saved: Saved[] };

const TICK_MS = 50;
const option = ({ code, nameKey }: { code: string; nameKey: string }) => ({ value: code, label: t(nameKey) });
const nameOf = (catalog: readonly { code: string; nameKey: string }[], code: string) => t(catalog.find((c) => c.code === code)?.nameKey ?? code);
const clock = () => BigInt(Math.round(performance.now() * 1e6));

// Times the athletes of the session one by one with the on-screen stopwatch and saves each time on the phone.
export function IndividualTimingFlow({ subtitle, loadRoster, measurements, userId, deviceId, now = clock, offline, onExit }: IndividualTimingFlowProps) {
  const [roster, setRoster] = useState<RosterAthlete[] | 'error'>();
  const [attempt, setAttempt] = useState(0);
  const [choice, setChoice] = useState<Choice>({
    stroke: strokes[0].code,
    distance: distances[1].code,
    pool: pools[0].code,
    sessionType: 'training',
  });
  const [step, setStep] = useState<Step>({ kind: 'setup' });
  const [stopwatch, setStopwatch] = useState<Stopwatch>(idleStopwatch);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    loadRoster()
      .then((athletes) => active && setRoster(athletes))
      .catch(() => active && setRoster('error'));
    return () => {
      active = false;
    };
  }, [loadRoster, attempt]);

  const running = stopwatch.status === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  const savedIds = step.kind === 'setup' ? [] : step.saved.map((s) => s.id);
  const syncStates = useRecordSyncStates('measurements', savedIds);

  if (roster === undefined) return <StateView kind="loading" />;
  if (roster === 'error') {
    return (
      <View style={{ flex: 1 }}>
        <StateView
          kind="error"
          title={t('timing.setup.error_title')}
          message={t('timing.setup.error_message')}
          action={{ label: t('timing.summary.retry_load'), onPress: () => (setRoster(undefined), setAttempt((n) => n + 1)) }}
        />
      </View>
    );
  }

  const field = (value: string, options: { code: string; nameKey: string }[]) => ({ value, options: options.map(option) });
  const authorized = roster.filter((a) => a.authorized);
  const eventSubtitle = `${nameOf(strokes, choice.stroke)} ${nameOf(distances, choice.distance)} · ${t(`timing.session_type.${choice.sessionType}`)}`;

  if (step.kind === 'setup') {
    return (
      <TimingSetupScreen
        subtitle={subtitle}
        stroke={field(choice.stroke, [...strokes])}
        distance={field(choice.distance, [...distances])}
        pool={field(choice.pool, [...pools])}
        sessionType={{
          value: choice.sessionType,
          options: (['training', 'competition'] as const).map((value) => ({ value, label: t(`timing.session_type.${value}`) })),
        }}
        source={{ value: 'screen_stopwatch', options: [{ value: 'screen_stopwatch', label: t('timing.source.phone') }] }}
        onStrokeChange={(stroke) => setChoice((c) => ({ ...c, stroke }))}
        onDistanceChange={(distance) => setChoice((c) => ({ ...c, distance }))}
        onPoolChange={(pool) => setChoice((c) => ({ ...c, pool }))}
        onSessionTypeChange={(sessionType) => setChoice((c) => ({ ...c, sessionType: sessionType as SessionType }))}
        // shortcut: the best time is not read yet, so the rows show "—"; upgrade with a read of each athlete's best for the event.
        athletes={roster.map((a) => ({ ...a, bestTime: null }))}
        selectedCount={authorized.length}
        groupCount={roster.length}
        // shortcut: everyone authorized is timed, in roster order; the picker screen does not exist yet.
        onChooseAthletes={() => {}}
        onSourceChange={() => {}}
        onStart={() => authorized.length > 0 && setStep({ kind: 'timing', queue: authorized, position: 0, saved: [] })}
        onBack={onExit}
      />
    );
  }

  if (step.kind === 'timing') {
    const athlete = step.queue[step.position]!;
    const elapsed = elapsedAt(stopwatch, now()) ?? (0 as Hundredths);
    const toSetup = () => {
      setStopwatch(reset());
      setExitConfirm(false);
      setStep({ kind: 'setup' });
    };

    async function save() {
      const total = totalTime(stopwatch);
      // A time of zero would be rejected by the server for good: it is not saved.
      if (total === null || total <= 0 || step.kind !== 'timing') return;
      const base = {
        athleteId: athlete.id,
        seriesId: null,
        arrivalPosition: null,
        stroke: choice.stroke,
        distance: choice.distance,
        pool: choice.pool,
        sessionType: choice.sessionType,
        source: 'screen_stopwatch',
        createdBy: userId,
        deviceId,
        capturedAt: new Date().toISOString(),
        version: 1,
        editedBy: null,
        editedAt: null,
        editReason: null,
      } as const;
      const id = randomUUID();
      try {
        await measurements.add({
          ...base,
          id,
          kind: choice.sessionType === 'competition' ? 'race' : 'repetition',
          hundredths: total,
          parentId: null,
        } as Measurement);
        for (const time of splitTimes(stopwatch)) {
          await measurements.add({ ...base, id: randomUUID(), kind: 'split', hundredths: time, parentId: id } as Measurement);
        }
      } catch {
        // Nothing is logged with the times (personal data); the stopped time stays on screen so it can be saved again.
        return;
      }
      const saved = [...step.saved, { id, athlete, time: total }];
      setStopwatch(reset());
      setStep(step.position + 1 < step.queue.length ? { ...step, position: step.position + 1, saved } : { kind: 'summary', saved });
    }

    return (
      <StopwatchScreen
        athleteName={athlete.shortName}
        position={step.position + 1}
        total={step.queue.length}
        eventSubtitle={eventSubtitle}
        offline={offline}
        state={stopwatch.status === 'idle' ? 'ready' : stopwatch.status}
        elapsedHundredths={elapsed}
        splits={splitTimes(stopwatch).map((value, i) => ({ label: `${t('timing.stopwatch.split')} ${i + 1}`, value }))}
        onStart={() => setStopwatch((sw) => start(sw, now()))}
        onSplit={() => setStopwatch((sw) => split(sw, now()))}
        onStop={() => setStopwatch((sw) => stop(sw, now()))}
        onSave={save}
        onDiscard={() => setStopwatch(reset())}
        // Leaving with a running or stopped time would lose it: the container asks first.
        onBack={() => (stopwatch.status === 'idle' ? toSetup() : setExitConfirm(true))}
        exitConfirmVisible={exitConfirm}
        onConfirmExit={toSetup}
        onCancelExit={() => setExitConfirm(false)}
      />
    );
  }

  return (
    <TimingSummaryScreen
      subtitle={eventSubtitle}
      status="ready"
      records={step.saved.map(({ id, athlete, time }) => ({
        id,
        shortName: athlete.shortName,
        initials: athlete.initials,
        color: athlete.color,
        time,
        syncState: syncStates.get(id) ?? 'on_device',
      }))}
      offline={offline}
      onRetry={(id) => {
        retryFailedRecord('measurements', id).catch(() => {});
      }}
      onRetryLoad={() => {}}
      // shortcut: correcting a saved time needs a screen that does not exist yet; the button does nothing until it does.
      onCorrect={() => {}}
      onFinish={onExit}
      onBack={onExit}
    />
  );
}
