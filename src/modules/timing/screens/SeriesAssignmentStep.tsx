import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { t } from '../../../core/i18n';
import type { Hundredths } from '../../../core/time';
import { useRecordSyncStates } from '../../../core/sync';
import { StateView } from '../../../core/ui';
import type { MeasurementEvent } from '../data/measurements';
import type { SeriesRepository } from '../data/series';
import { assign, reopen, shownRows, targetRow, type AssignmentRow } from '../domain/assignment';
import '../i18n';
import { SeriesAssignmentScreen } from './SeriesAssignmentScreen';
import type { RosterAthlete } from './timingSession';

export type SeriesAssignmentStepProps = {
  series: SeriesRepository;
  seriesId: string;
  // The cards: the athletes who can be given a position.
  athletes: RosterAthlete[];
  // The series heading, for example "Serie 2 · Libre 50 m".
  heading: string;
  // The event of the series; with `loadBestTime` the cards show each athlete's personal best for it.
  event?: MeasurementEvent;
  loadBestTime?(athleteId: string, event: MeasurementEvent): Promise<Hundredths | null>;
  deviceId: string;
  offline?: boolean;
  // Leaving, finished or not: every position left without a name stays "por asignar" on the phone.
  onDone: () => void;
};

// Names the arrivals of a series saved on the phone. Each card is written the moment it is tapped, so leaving at any time keeps the work.
export function SeriesAssignmentStep({ series: repository, seriesId, athletes, heading, event, loadBestTime, deviceId, offline, onDone }: SeriesAssignmentStepProps) {
  const [rows, setRows] = useState<AssignmentRow[] | 'error'>();
  // A position the user tapped to choose another card for it.
  const [reopened, setReopened] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const writing = useRef(false);

  useEffect(() => {
    let active = true;
    repository
      .listArrivals(seriesId)
      .then((arrivals) => active && setRows(arrivals.map((m, index) => ({ id: m.id, position: m.arrivalPosition ?? index + 1, time: m.hundredths, athleteId: m.athleteId }))))
      .catch(() => active && setRows('error'));
    return () => {
      active = false;
    };
  }, [repository, seriesId, attempt]);

  // Personal bests are read once; an athlete without one, or a read that fails, simply shows none.
  const [bests, setBests] = useState<Record<string, Hundredths | null>>({});
  useEffect(() => {
    if (!loadBestTime || !event) return;
    let active = true;
    Promise.all(athletes.map(async (a) => [a.id, await loadBestTime(a.id, event).catch(() => null)] as const)).then(
      (pairs) => active && setBests(Object.fromEntries(pairs)),
    );
    return () => {
      active = false;
    };
    // The cards of the series are the ones that count: reading again for a new roster object would only repeat the same reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBestTime, event?.stroke, event?.distance, event?.pool, athletes.map((a) => a.id).join(',')]);

  const syncStates = useRecordSyncStates('measurements', Array.isArray(rows) ? rows.map((r) => r.id) : []);

  if (rows === undefined) return <StateView kind="loading" />;
  if (rows === 'error') {
    return (
      <View style={{ flex: 1 }}>
        <StateView
          kind="error"
          title={t('timing.setup.error_title')}
          message={t('timing.setup.error_message')}
          action={{ label: t('timing.summary.retry_load'), onPress: () => (setRows(undefined), setAttempt((n) => n + 1)) }}
        />
      </View>
    );
  }

  async function onAssign(athleteId: string) {
    // One write at a time: a second tap meanwhile would pick the same position from rows that are about to change.
    if (writing.current || rows === 'error' || rows === undefined) return;
    const result = assign(rows, reopened, athleteId);
    if (!result.ok) return;
    const { row } = result;
    if (row.athleteId !== athleteId) {
      writing.current = true;
      try {
        await repository.assign([{ id: row.id, athleteId }], { deviceId });
      } catch {
        // Nothing is logged with the names (personal data); the card stays as it was and can be tapped again, and the coach is told.
        setFailed(true);
        return;
      } finally {
        writing.current = false;
      }
      setRows((current) => (Array.isArray(current) ? current.map((r) => (r.id === row.id ? { ...r, athleteId } : r)) : current));
    }
    setFailed(false);
    setReopened(null);
  }

  const shown = shownRows(rows, reopened);
  return (
    <SeriesAssignmentScreen
      positions={shown.map((r) => ({ position: r.position, time: r.time, athleteId: r.athleteId, syncState: syncStates.get(r.id) ?? 'on_device' }))}
      highlightedPosition={targetRow(rows, reopened)?.position ?? null}
      athletes={athletes.map((a) => ({ ...a, bestTime: bests[a.id] ?? null }))}
      heading={heading}
      offline={offline}
      error={failed ? t('timing.series.assign_error') : undefined}
      onAssign={onAssign}
      onReopen={(position) => setReopened((current) => reopen(rows, current, position))}
      onSave={onDone}
      onBack={onDone}
    />
  );
}
