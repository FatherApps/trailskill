import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';

import { t } from '../../../core/i18n';
import { usePreferences } from '../../../core/preferences';
import { retryFailedRecord, useRecordSyncStates } from '../../../core/sync';
import type { Hundredths } from '../../../core/time';
import { StateView } from '../../../core/ui';
import {
  CompletedMeasurementTimeError,
  InvalidMeasurementTimeError,
  type Measurement,
  type MeasurementEvent,
  type MeasurementRepository,
} from '../data/measurements';
import { elapsedAt, idleStopwatch, reset, split, splitTimes, start, stop, totalTime, type Stopwatch } from '../domain/stopwatch';
import { stopwatchButtonsHint } from '../data/keyName';
import type { SessionSetupRepository } from '../data/sessionSetup';
import { timingButton, type TimingButtonPort } from '../data/timingButton';
import { buttonSettingsOf, useButtonDisconnect, useTimingButtons } from '../data/useTimingButtons';
import type { ButtonTarget } from '../domain/timingButton';
import '../i18n';
import { StopwatchScreen } from './StopwatchScreen';
import { TimeCorrectionScreen } from './TimeCorrectionScreen';
import { TimingSummaryScreen } from './TimingSummaryScreen';
import { eventSubtitleOf, kindOf, RosterGate, TimingSetupStep, type RosterAthlete } from './timingSession';
import { useSessionSetup } from './useSessionSetup';

export type IndividualTimingFlowProps = {
  // For example the school name.
  subtitle: string;
  // The school the times are written for.
  schoolId: string;
  loadRoster(): Promise<RosterAthlete[]>;
  measurements: MeasurementRepository;
  // Remembers the event and the athletes between sessions; without it the setup lives only while the flow is open.
  setups?: SessionSetupRepository;
  // The athlete's best time in the event, to show how the new time compares; without it, or when it fails, no difference is shown.
  loadBestTime?(athleteId: string, event: MeasurementEvent): Promise<Hundredths | null>;
  userId: string;
  deviceId: string;
  // Monotonic clock in nanoseconds; the stopwatch only uses differences. By default the timing buttons' clock, so a touch
  // and a key press share one time base.
  now?: () => bigint;
  // The physical timing keys (headset or volume keys); without the native module they are simply not there.
  buttons?: TimingButtonPort;
  offline?: boolean;
  onExit: () => void;
};

const targetOf = (sw: Stopwatch): ButtonTarget => (sw.status === 'running' ? { status: 'running', startedAt: sw.startedAt } : { status: sw.status });

// `null` is a time that was corrected to missing, never 0.
type Saved = { id: string; athlete: RosterAthlete; time: Hundredths | null };
type Step =
  | { kind: 'setup' }
  | { kind: 'timing'; queue: RosterAthlete[]; position: number; saved: Saved[] }
  | { kind: 'summary'; saved: Saved[] }
  | { kind: 'correct'; saved: Saved[]; id: string; error?: string };

// The repository's own refusals, worded for the person; the validation itself stays in the repository.
function correctionError(error: unknown): string {
  if (error instanceof InvalidMeasurementTimeError) return t('timing.correct.error_invalid');
  if (error instanceof CompletedMeasurementTimeError) return t('timing.correct.error_completed');
  return t('timing.correct.error_failed');
}

const TICK_MS = 50;

// Times the athletes of the session one by one with the on-screen stopwatch and saves each time on the phone.
export function IndividualTimingFlow(props: IndividualTimingFlowProps) {
  return <RosterGate loadRoster={props.loadRoster}>{(roster) => <IndividualSession {...props} roster={roster} />}</RosterGate>;
}

function IndividualSession({
  subtitle,
  schoolId,
  roster,
  measurements,
  setups,
  loadBestTime,
  userId,
  deviceId,
  now: nowProp,
  buttons = timingButton,
  offline,
  onExit,
}: IndividualTimingFlowProps & { roster: RosterAthlete[] }) {
  const now = nowProp ?? buttons.now;
  const { choice, selectedIds, ready, changeChoice, changeSelected } = useSessionSetup(setups, roster);
  const [step, setStep] = useState<Step>({ kind: 'setup' });
  const [stopwatch, setStopwatch] = useState<Stopwatch>(idleStopwatch);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [, setTick] = useState(0);

  // A key press acts on the stopwatch as it is at that instant, not as it was at the last render.
  const latestStopwatch = useRef(stopwatch);
  useEffect(() => {
    latestStopwatch.current = stopwatch;
  });
  const settings = buttonSettingsOf(usePreferences().preferences.timingButtons);
  const keys = useTimingButtons({
    ...settings,
    // While the stopwatch is shown; a press after the stop does nothing, so the volume doesn't jump mid-session either.
    enabled: settings.enabled && step.kind === 'timing',
    target: () => targetOf(latestStopwatch.current),
    port: buttons,
    onAction: (action, at) => {
      const apply = action === 'start' ? start : action === 'split' ? split : action === 'stop' ? stop : null;
      if (!apply) return;
      latestStopwatch.current = apply(latestStopwatch.current, at);
      setStopwatch(latestStopwatch.current);
    },
  });
  const disconnect = useButtonDisconnect(keys.active, keys.keyboards);

  const running = stopwatch.status === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  // The best belongs to the athlete being timed; a read that comes back late for another one is ignored.
  const [best, setBest] = useState<{ athleteId: string; value: Hundredths | null }>();
  const timedId = step.kind === 'timing' ? step.queue[step.position]!.id : undefined;
  useEffect(() => {
    if (!loadBestTime || !timedId) return;
    let active = true;
    loadBestTime(timedId, { stroke: choice.stroke, distance: choice.distance, pool: choice.pool } as MeasurementEvent)
      .then((value) => active && setBest({ athleteId: timedId, value }))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [loadBestTime, timedId, choice.stroke, choice.distance, choice.pool]);

  const savedIds = step.kind === 'setup' ? [] : step.saved.map((s) => s.id);
  const syncStates = useRecordSyncStates('measurements', savedIds);

  const eventSubtitle = eventSubtitleOf(choice);

  if (step.kind === 'setup') {
    if (!ready) return <StateView kind="loading" />;
    return (
      <TimingSetupStep
        subtitle={subtitle}
        roster={roster}
        choice={choice}
        onChoiceChange={changeChoice}
        selectedIds={selectedIds}
        onSelectedIdsChange={changeSelected}
        sourceLabel={t('timing.source.phone')}
        onStart={(queue) => setStep({ kind: 'timing', queue, position: 0, saved: [] })}
        onBack={onExit}
      />
    );
  }

  if (step.kind === 'timing') {
    const athlete = step.queue[step.position]!;
    const elapsed = elapsedAt(stopwatch, now()) ?? (0 as Hundredths);
    // The mark is taken here, at the touch: the updater runs when React renders, which may be later.
    const markedAt = (apply: (current: Stopwatch, at: bigint) => Stopwatch) => () => {
      const at = now();
      setStopwatch((current) => apply(current, at));
    };
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
        schoolId,
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
          kind: kindOf(choice),
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
        bestTime={best?.athleteId === athlete.id ? best.value : null}
        splits={splitTimes(stopwatch).map((value, i) => ({ label: `${t('timing.stopwatch.split')} ${i + 1}`, value }))}
        onStart={markedAt(start)}
        onSplit={markedAt(split)}
        onStop={markedAt(stop)}
        onSave={save}
        onDiscard={() => setStopwatch(reset())}
        // Leaving with a running or stopped time would lose it: the container asks first.
        onBack={() => (stopwatch.status === 'idle' ? toSetup() : setExitConfirm(true))}
        exitConfirmVisible={exitConfirm}
        onConfirmExit={toSetup}
        onCancelExit={() => setExitConfirm(false)}
        buttonsHint={keys.active ? stopwatchButtonsHint(settings.config.startKey, settings.config.splitKey, keys.keyboards[0]?.name) : undefined}
        externalTimerDisconnected={disconnect.disconnected}
        onUseOnScreenStopwatch={disconnect.dismiss}
      />
    );
  }

  if (step.kind === 'correct') {
    const { saved, id } = step;
    const target = saved.find((s) => s.id === id)!;
    const toSummary = () => setStep({ kind: 'summary', saved });

    async function correct(time: Hundredths | null) {
      try {
        await measurements.edit(id, { hundredths: time }, { deviceId });
      } catch (error) {
        setStep({ kind: 'correct', saved, id, error: correctionError(error) });
        return;
      }
      setStep({ kind: 'summary', saved: saved.map((s) => (s.id === id ? { ...s, time } : s)) });
    }

    return (
      <TimeCorrectionScreen
        subtitle={eventSubtitle}
        athleteName={target.athlete.shortName}
        initialTime={target.time}
        error={step.error}
        onSave={correct}
        onBack={toSummary}
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
      onCorrect={(id) => setStep({ kind: 'correct', saved: step.saved, id })}
      onFinish={onExit}
      onBack={onExit}
    />
  );
}
