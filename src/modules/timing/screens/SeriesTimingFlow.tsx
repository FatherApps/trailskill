import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';

import { t } from '../../../core/i18n';
import { useRecordSyncStates } from '../../../core/sync';
import { hundredthsFromNanos, type Hundredths } from '../../../core/time';
import { ConfirmSheet, StateView } from '../../../core/ui';
import type { Measurement } from '../data/measurements';
import type { SeriesRecord, SeriesRepository } from '../data/series';
import type { SessionSetupRepository } from '../data/sessionSetup';
import { arrivals, assignHighlighted, press, readySeries, reopen, undoLastArrival, type Series } from '../domain/series';
import '../i18n';
import { SeriesAssignmentScreen } from './SeriesAssignmentScreen';
import { SeriesTimingScreen } from './SeriesTimingScreen';
import { eventSubtitleOf, kindOf, RosterGate, TimingSetupStep, type RosterAthlete } from './timingSession';
import { useSessionSetup } from './useSessionSetup';

export type SeriesTimingFlowProps = {
  // For example the school name.
  subtitle: string;
  loadRoster(): Promise<RosterAthlete[]>;
  series: SeriesRepository;
  // Remembers the event and the athletes between sessions; without it the setup lives only while the flow is open.
  setups?: SessionSetupRepository;
  userId: string;
  deviceId: string;
  // Monotonic clock in nanoseconds; the series only uses differences.
  now?: () => bigint;
  offline?: boolean;
  onExit: () => void;
};

type Step = { kind: 'setup' } | { kind: 'timing'; queue: RosterAthlete[] } | { kind: 'assign'; queue: RosterAthlete[] };

// The series being timed. It lives in a ref so each touch reads and writes the latest value at once; `commit` redraws the screen.
type Session = {
  series: Series;
  // The measurement id of each arrival of `series`, in order.
  ids: string[];
  seriesId: string | null;
  // Whether the series row is on the phone already; the first arrival that gets written opens it.
  opened: boolean;
  // Arrivals not written yet, or whose write failed: they are written again when the series is saved.
  unsaved: Map<string, Measurement>;
  // Writes run one after another, so the series row always goes first and an undo comes after its arrival.
  writes: Promise<void>;
};

const newSession = (): Session => ({ series: readySeries, ids: [], seriesId: null, opened: false, unsaved: new Map(), writes: Promise.resolve() });

const TICK_MS = 50;
const clock = () => BigInt(Math.round(performance.now() * 1e6));

// Times a group that starts together with one shared clock and one arrival button, then names each arrival.
export function SeriesTimingFlow(props: SeriesTimingFlowProps) {
  return <RosterGate loadRoster={props.loadRoster}>{(roster) => <SeriesSession {...props} roster={roster} />}</RosterGate>;
}

function SeriesSession({ subtitle, roster, series: repository, setups, userId, deviceId, now = clock, offline, onExit }: SeriesTimingFlowProps & { roster: RosterAthlete[] }) {
  const { choice, selectedIds, ready, changeChoice, changeSelected } = useSessionSetup(setups, roster);
  const [step, setStep] = useState<Step>({ kind: 'setup' });
  const session = useRef<Session>(newSession());
  const [series, setSeries] = useState<Series>(readySeries);
  const [ids, setIds] = useState<string[]>([]);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [, setTick] = useState(0);

  const commit = () => {
    setSeries(session.current.series);
    setIds(session.current.ids);
  };
  const reset = () => {
    session.current = newSession();
    commit();
  };

  const running = series.status === 'running' && step.kind === 'timing';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  const syncStates = useRecordSyncStates('measurements', ids);
  const eventSubtitle = eventSubtitleOf(choice);
  const positions = arrivals(series);
  const toSetup = () => {
    reset();
    setExitConfirm(false);
    setStep({ kind: 'setup' });
  };

  // Writes one arrival on the phone. A failed write stays in `unsaved` (nothing is logged with the times: personal data) and is tried again on save.
  async function write(s: Session, arrival: Measurement) {
    if (!s.unsaved.has(arrival.id)) return;
    try {
      if (s.opened) await repository.addArrival(arrival);
      else await repository.open({ id: s.seriesId, createdBy: userId, deviceId, ...choice } as SeriesRecord, arrival);
      s.opened = true;
      s.unsaved.delete(arrival.id);
    } catch {
      // Kept in `unsaved`.
    }
  }

  // The arrival at the instant `at`, the monotonic mark of the touch. The on-screen button calls it with the clock; an external button can call it with its own mark.
  const arriveAt = (at: bigint) => {
    const s = session.current;
    const next = press(s.series, at);
    // A mark earlier than the last one is ignored.
    if (next === s.series) return;
    const before = arrivals(s.series).length;
    s.series = next;
    const list = arrivals(next);
    // The first press only starts the shared clock; every later one is an arrival and goes to the phone right now.
    if (list.length > before) {
      const { position, time } = list[list.length - 1]!;
      s.seriesId ??= randomUUID();
      const id = randomUUID();
      s.ids = [...s.ids, id];
      const arrival = {
        id,
        kind: kindOf(choice),
        athleteId: null,
        seriesId: s.seriesId,
        arrivalPosition: position,
        // An arrival at the very instant of the start has no usable time: it is saved without one, never as zero.
        hundredths: time > 0 ? time : null,
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
      } as Measurement;
      s.unsaved.set(id, arrival);
      s.writes = s.writes.then(() => write(s, arrival));
    }
    commit();
  };

  // Takes the last arrival off the screen and marks it discarded on the phone. If its write never succeeded there is nothing to discard.
  const undoLast = () => {
    const s = session.current;
    const id = s.ids[s.ids.length - 1];
    if (!id) return;
    s.series = undoLastArrival(s.series);
    s.ids = s.ids.slice(0, -1);
    s.unsaved.delete(id);
    s.writes = s.writes.then(() => repository.discardArrival(id, userId)).catch(() => {});
    commit();
  };

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
          arrivals={positions.map(({ position, time }) => {
            const id = ids[position - 1]!;
            return { id, time, syncState: syncStates.get(id) ?? 'on_device' };
          })}
          running={running}
          offline={offline}
          onArrival={() => arriveAt(now())}
          onUndoLast={undoLast}
          onAssignNames={() => setStep({ kind: 'assign', queue: step.queue })}
          // Leaving with arrivals keeps them on the phone as "por asignar"; the container asks first.
          onBack={() => (positions.length === 0 ? toSetup() : setExitConfirm(true))}
        />
        <ConfirmSheet
          visible={exitConfirm}
          title={t('timing.series.exit_title')}
          message={t('timing.series.exit_message')}
          confirmLabel={t('timing.series.exit_confirm')}
          cancelLabel={t('timing.series.exit_cancel')}
          onConfirm={toSetup}
          onCancel={() => setExitConfirm(false)}
        />
      </>
    );
  }

  // The arrivals are on the phone already: saving writes the names and any arrival whose write had failed, then the next series is ready.
  async function save() {
    const s = session.current;
    try {
      await s.writes;
      for (const arrival of [...s.unsaved.values()]) await write(s, arrival);
      if (s.unsaved.size > 0) return;
      const assignments = arrivals(s.series).flatMap(({ position, athleteId }) => (athleteId ? [{ id: s.ids[position - 1]!, athleteId }] : []));
      await repository.assign(assignments, { deviceId });
    } catch {
      // The assignment stays on screen so it can be saved again.
      return;
    }
    reset();
    setStep({ kind: 'timing', queue: step.kind === 'assign' ? step.queue : [] });
  }

  return (
    <SeriesAssignmentScreen
      positions={positions}
      athletes={step.queue}
      eventSubtitle={eventSubtitle}
      offline={offline}
      onAssign={(athleteId) => {
        // A duplicate or a full list changes nothing: the cards already show who has a position.
        const result = assignHighlighted(session.current.series, athleteId);
        if (!result.ok) return;
        session.current.series = result.series;
        commit();
      }}
      onReopen={(position) => {
        session.current.series = reopen(session.current.series, position);
        commit();
      }}
      onSave={save}
      onBack={() => setStep({ kind: 'timing', queue: step.queue })}
    />
  );
}
