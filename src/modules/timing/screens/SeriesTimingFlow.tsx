import { randomUUID } from 'expo-crypto';
import { useEffect, useState } from 'react';

import { t } from '../../../core/i18n';
import { hundredthsFromNanos, type Hundredths } from '../../../core/time';
import { ConfirmSheet } from '../../../core/ui';
import type { Measurement } from '../data/measurements';
import type { SeriesRepository } from '../data/series';
import { arrivals, assignHighlighted, press, readySeries, reopen, undoLastArrival, type Series } from '../domain/series';
import '../i18n';
import { SeriesAssignmentScreen } from './SeriesAssignmentScreen';
import { SeriesTimingScreen } from './SeriesTimingScreen';
import { eventSubtitleOf, initialChoice, kindOf, RosterGate, TimingSetupStep, type Choice, type RosterAthlete } from './timingSession';

export type SeriesTimingFlowProps = {
  // For example the school name.
  subtitle: string;
  loadRoster(): Promise<RosterAthlete[]>;
  series: SeriesRepository;
  userId: string;
  deviceId: string;
  // Monotonic clock in nanoseconds; the series only uses differences.
  now?: () => bigint;
  offline?: boolean;
  onExit: () => void;
};

type Step = { kind: 'setup' } | { kind: 'timing'; queue: RosterAthlete[] } | { kind: 'assign'; queue: RosterAthlete[] };

const TICK_MS = 50;
const clock = () => BigInt(Math.round(performance.now() * 1e6));

// Times a group that starts together with one shared clock and one arrival button, then names each arrival.
export function SeriesTimingFlow(props: SeriesTimingFlowProps) {
  return <RosterGate loadRoster={props.loadRoster}>{(roster) => <SeriesSession {...props} roster={roster} />}</RosterGate>;
}

function SeriesSession({ subtitle, roster, series: repository, userId, deviceId, now = clock, offline, onExit }: SeriesTimingFlowProps & { roster: RosterAthlete[] }) {
  const [choice, setChoice] = useState<Choice>(initialChoice);
  const [step, setStep] = useState<Step>({ kind: 'setup' });
  const [series, setSeries] = useState<Series>(readySeries);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [, setTick] = useState(0);

  const running = series.status === 'running' && step.kind === 'timing';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  const eventSubtitle = eventSubtitleOf(choice);
  const positions = arrivals(series);
  const toSetup = () => {
    setSeries(readySeries);
    setExitConfirm(false);
    setStep({ kind: 'setup' });
  };

  if (step.kind === 'setup') {
    return (
      <TimingSetupStep
        subtitle={subtitle}
        roster={roster}
        choice={choice}
        onChoiceChange={(change) => setChoice((c) => ({ ...c, ...change }))}
        sourceLabel={t('timing.source.phone')}
        onStart={(queue) => setStep({ kind: 'timing', queue })}
        onBack={onExit}
      />
    );
  }

  if (step.kind === 'timing') {
    const elapsed = series.status === 'running' ? hundredthsFromNanos(now() - series.startedAt) : (0 as Hundredths);
    return (
      <>
        <SeriesTimingScreen
          athleteCount={step.queue.length}
          eventSubtitle={eventSubtitle}
          elapsedHundredths={elapsed}
          arrivals={positions.map(({ position, time }) => ({ id: `arrival-${position}`, time }))}
          offline={offline}
          // The first press starts the shared clock; every later one is an arrival.
          onArrival={() => setSeries((current) => press(current, now()))}
          onUndoLast={() => setSeries(undoLastArrival)}
          onAssignNames={() => setStep({ kind: 'assign', queue: step.queue })}
          // Leaving with arrivals would lose them: the container asks first.
          onBack={() => (positions.length === 0 ? toSetup() : setExitConfirm(true))}
        />
        <ConfirmSheet
          visible={exitConfirm}
          title={t('timing.series.exit_title')}
          message={t('timing.series.exit_message')}
          confirmLabel={t('timing.series.exit_confirm')}
          cancelLabel={t('timing.series.exit_cancel')}
          destructive
          onConfirm={toSetup}
          onCancel={() => setExitConfirm(false)}
        />
      </>
    );
  }

  async function save() {
    const seriesId = randomUUID();
    const base = {
      seriesId,
      stroke: choice.stroke,
      distance: choice.distance,
      pool: choice.pool,
      sessionType: choice.sessionType,
      source: 'screen_button',
      createdBy: userId,
      deviceId,
      capturedAt: new Date().toISOString(),
      parentId: null,
      version: 1,
      editedBy: null,
      editedAt: null,
      editReason: null,
    } as const;
    try {
      await repository.save(
        { id: seriesId, createdBy: userId, deviceId, ...choice } as Parameters<SeriesRepository['save']>[0],
        // An arrival at the very instant of the start has no usable time: it is saved without one, never as zero.
        positions.map(
          ({ position, time, athleteId }) =>
            ({ ...base, id: randomUUID(), kind: kindOf(choice), athleteId, arrivalPosition: position, hundredths: time > 0 ? time : null }) as Measurement,
        ),
      );
    } catch {
      // Nothing is logged with the times (personal data); the series stays on screen so it can be saved again.
      return;
    }
    toSetup();
  }

  return (
    <SeriesAssignmentScreen
      positions={positions}
      athletes={step.queue}
      eventSubtitle={eventSubtitle}
      offline={offline}
      onAssign={(athleteId) =>
        // A duplicate or a full list changes nothing: the cards already show who has a position.
        setSeries((current) => {
          const result = assignHighlighted(current, athleteId);
          return result.ok ? result.series : current;
        })
      }
      onReopen={(position) => setSeries((current) => reopen(current, position))}
      onSave={save}
      onBack={() => setStep({ kind: 'timing', queue: step.queue })}
    />
  );
}
