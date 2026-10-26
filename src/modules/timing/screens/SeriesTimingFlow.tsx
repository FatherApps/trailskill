import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';

import { t } from '../../../core/i18n';
import { useRecordSyncStates } from '../../../core/sync';
import { hundredthsFromNanos, type Hundredths } from '../../../core/time';
import { ConfirmSheet, StateView } from '../../../core/ui';
import type { Measurement, MeasurementEvent } from '../data/measurements';
import type { PendingSeries, SeriesRecord, SeriesRepository } from '../data/series';
import type { Choice, SessionSetupRepository } from '../data/sessionSetup';
import { arrivalClockTime, formatClockTime } from '../domain/clockTime';
import { arrivals, press, readySeries, undoLastArrival, type Series } from '../domain/series';
import '../i18n';
import { SeriesAssignmentStep } from './SeriesAssignmentStep';
import { SeriesTimingScreen } from './SeriesTimingScreen';
import { eventTitleOf, kindOf, RosterGate, sessionLabelOf, TimingSetupStep, type RosterAthlete } from './timingSession';
import { useSessionSetup } from './useSessionSetup';

export type SeriesTimingFlowProps = {
  // For example the school name.
  subtitle: string;
  // The school the times are written for.
  schoolId: string;
  loadRoster(): Promise<RosterAthlete[]>;
  series: SeriesRepository;
  // Remembers the event and the athletes between sessions; without it the setup lives only while the flow is open.
  setups?: SessionSetupRepository;
  userId: string;
  deviceId: string;
  // Monotonic clock in nanoseconds; the series only uses differences.
  now?: () => bigint;
  // The best time on this device for the event; the name cards show it. Without it they show none.
  loadBestTime?(athleteId: string, event: MeasurementEvent): Promise<Hundredths | null>;
  offline?: boolean;
  onExit: () => void;
};

// `assign` is the naming of a series saved on the phone: the one just timed (`live`, whose session is reset when it ends) or an earlier one (`pending`).
type Step =
  | { kind: 'setup' }
  | { kind: 'timing'; queue: RosterAthlete[] }
  | { kind: 'assign'; queue: RosterAthlete[]; seriesId: string; heading: string; event: MeasurementEvent; origin: 'live' | 'pending' };

// The series being timed. It lives in a ref so each touch reads and writes the latest value at once; `commit` redraws the screen.
type Session = {
  series: Series;
  // The measurement id of each arrival of `series`, in order.
  ids: string[];
  seriesId: string | null;
  // The wall-clock time of the first press, to show when each arrival happened; not part of the series rules.
  startedWall: number | null;
  // Whether the series row is on the phone already; the first arrival that gets written opens it.
  opened: boolean;
  // Arrivals not written yet, or whose write failed: they are written again when the series is saved.
  unsaved: Map<string, Measurement>;
  // Undone arrivals whose discard has not gone through yet: tried again on save and on exit.
  discards: Set<string>;
  // Writes run one after another, so the series row always goes first and an undo comes after its arrival.
  writes: Promise<void>;
};

const newSession = (): Session => ({ series: readySeries, ids: [], seriesId: null, startedWall: null, opened: false, unsaved: new Map(), discards: new Set(), writes: Promise.resolve() });

const TICK_MS = 50;
const clock = () => BigInt(Math.round(performance.now() * 1e6));

// Times a group that starts together with one shared clock and one arrival button, then names each arrival.
export function SeriesTimingFlow(props: SeriesTimingFlowProps) {
  return <RosterGate loadRoster={props.loadRoster}>{(roster) => <SeriesSession {...props} roster={roster} />}</RosterGate>;
}

function SeriesSession({ subtitle, schoolId, roster, series: repository, setups, userId, deviceId, now = clock, loadBestTime, offline, onExit }: SeriesTimingFlowProps & { roster: RosterAthlete[] }) {
  const { choice, selectedIds, ready, changeChoice, changeSelected } = useSessionSetup(setups, roster);
  const [step, setStep] = useState<Step>({ kind: 'setup' });
  const session = useRef<Session>(newSession());
  const [series, setSeries] = useState<Series>(readySeries);
  const [ids, setIds] = useState<string[]>([]);
  const [startedWall, setStartedWall] = useState<number | null>(null);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [pending, setPending] = useState<PendingSeries[]>([]);
  const [nameFailed, setNameFailed] = useState(false);
  // The number of the series being timed in this visit: the first is 1 and each one named adds one.
  const [seriesNumber, setSeriesNumber] = useState(1);
  const leaving = useRef(false);
  const naming = useRef(false);
  const [, setTick] = useState(0);

  const commit = () => {
    setSeries(session.current.series);
    setIds(session.current.ids);
    setStartedWall(session.current.startedWall);
  };
  const reset = () => {
    session.current = newSession();
    setNameFailed(false);
    commit();
  };

  const running = series.status === 'running' && step.kind === 'timing';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  // Arrivals of earlier series that still have no name, read again every time the setup opens (a series just named drops out).
  useEffect(() => {
    if (step.kind !== 'setup') return;
    let active = true;
    repository
      .listPending(schoolId)
      .then((list) => active && setPending(list))
      // Without a fresh read an old notice could be about a series that is named by now: show none.
      .catch(() => active && setPending([]));
    return () => {
      active = false;
    };
  }, [repository, schoolId, step.kind]);

  const syncStates = useRecordSyncStates('measurements', ids);
  const eventTitle = eventTitleOf(choice);
  const event = { stroke: choice.stroke, distance: choice.distance, pool: choice.pool } as MeasurementEvent;
  const positions = arrivals(series);
  const toSetup = () => {
    reset();
    leaving.current = false;
    setExitConfirm(false);
    setStep({ kind: 'setup' });
  };

  // Writes one arrival on the phone. A failed write stays in `unsaved` (nothing is logged with the times: personal data) and is tried again on save.
  async function write(s: Session, arrival: Measurement) {
    if (!s.unsaved.has(arrival.id)) return;
    try {
      if (s.opened) await repository.addArrival(arrival);
      else await repository.open({ id: s.seriesId, createdBy: userId, schoolId, deviceId, ...choice } as SeriesRecord, arrival);
      s.opened = true;
      s.unsaved.delete(arrival.id);
    } catch {
      // Kept in `unsaved`.
    }
  }

  async function discard(s: Session, id: string) {
    if (!s.discards.has(id)) return;
    try {
      await repository.discardArrival(id, userId);
      s.discards.delete(id);
    } catch {
      // Kept in `discards`.
    }
  }

  // Everything still pending: arrivals whose write failed and discards that failed. Each is tried once more.
  async function flush(s: Session) {
    await s.writes;
    for (const arrival of [...s.unsaved.values()]) await write(s, arrival);
    for (const id of [...s.discards]) await discard(s, id);
  }

  // The arrival at the instant `at`, the monotonic mark of the touch. The on-screen button calls it with the clock; an external button can call it with its own mark.
  const arriveAt = (at: bigint) => {
    const s = session.current;
    const next = press(s.series, at);
    // A mark earlier than the last one is ignored.
    if (next === s.series) return;
    const before = arrivals(s.series).length;
    s.startedWall ??= Date.now();
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
        schoolId,
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
    s.discards.add(id);
    s.writes = s.writes.then(() => discard(s, id));
    commit();
  };

  // Ends the capture and names the arrivals, which are all on the phone by then.
  async function nameArrivals(queue: RosterAthlete[]) {
    // A second tap while the first is still writing would write the same arrivals twice.
    if (naming.current) return;
    naming.current = true;
    setNameFailed(false);
    const s = session.current;
    try {
      await flush(s);
      // An arrival still not written cannot be named: stay and say so, and the next tap tries again.
      if (s.unsaved.size > 0 || s.discards.size > 0 || !s.seriesId) {
        setNameFailed(true);
        return;
      }
      setStep({ kind: 'assign', queue, seriesId: s.seriesId, heading: t('timing.series.heading', { number: seriesNumber, event: eventTitle }), event, origin: 'live' });
    } catch {
      // Stay on the timing screen, say so; the next tap tries again.
      setNameFailed(true);
    } finally {
      naming.current = false;
    }
  }

  if (step.kind === 'setup') {
    if (!ready) return <StateView kind="loading" />;
    const [first] = pending;
    const pendingEvent = first && ({ stroke: first.stroke, distance: first.distance, pool: first.pool } as MeasurementEvent);
    const event = first && `${eventTitleOf(first as Choice)} · ${sessionLabelOf(first as Choice)}`;
    return (
      <TimingSetupStep
        subtitle={subtitle}
        roster={roster}
        choice={choice}
        onChoiceChange={changeChoice}
        selectedIds={selectedIds}
        onSelectedIdsChange={changeSelected}
        sourceLabel={t('timing.source.phone')}
        pending={
          first && {
            count: first.pending,
            event: event!,
            onOpen: () =>
              setStep({ kind: 'assign', queue: roster.filter((a) => a.authorized), seriesId: first.seriesId, heading: t('timing.series.heading_unnumbered', { event: eventTitleOf(first as Choice) }), event: pendingEvent!, origin: 'pending' }),
          }
        }
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
          seriesNumber={seriesNumber}
          eventTitle={eventTitle}
          sessionLabel={sessionLabelOf(choice)}
          elapsedHundredths={elapsed}
          startedAt={startedWall === null ? undefined : formatClockTime(startedWall)}
          arrivals={positions.map(({ position, time }) => {
            const id = ids[position - 1]!;
            return { id, time, syncState: syncStates.get(id) ?? 'on_device', clockTime: startedWall === null ? undefined : arrivalClockTime(startedWall, time) };
          })}
          running={running}
          error={nameFailed ? t('timing.series.name_error') : undefined}
          offline={offline}
          onArrival={() => arriveAt(now())}
          onUndoLast={undoLast}
          onAssignNames={() => nameArrivals(step.queue)}
          // Leaving with arrivals keeps them on the phone as "por asignar"; the container asks first.
          onBack={() => (positions.length === 0 ? toSetup() : setExitConfirm(true))}
        />
        <ConfirmSheet
          visible={exitConfirm}
          title={t('timing.series.exit_title')}
          message={t('timing.series.exit_message')}
          confirmLabel={t('timing.series.exit_confirm')}
          cancelLabel={t('timing.series.exit_cancel')}
          onConfirm={async () => {
            // A second tap while the first one is still writing would write everything twice.
            if (leaving.current) return;
            leaving.current = true;
            // Leaving must not drop an arrival whose write failed: one more try, then out.
            await flush(session.current).catch(() => {});
            toSetup();
          }}
          onCancel={() => setExitConfirm(false)}
        />
      </>
    );
  }

  const done = () => {
    // The series just timed is over: the next one is ready. An earlier one goes back to the setup, which lists what is still unnamed.
    if (step.origin === 'live') {
      reset();
      setSeriesNumber((n) => n + 1);
      setStep({ kind: 'timing', queue: step.queue });
    } else {
      setStep({ kind: 'setup' });
    }
  };

  return (
    <SeriesAssignmentStep
      series={repository}
      seriesId={step.seriesId}
      athletes={step.queue}
      heading={step.heading}
      event={step.event}
      loadBestTime={loadBestTime}
      deviceId={deviceId}
      offline={offline}
      onDone={done}
    />
  );
}
