import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';

import { t } from '../../../core/i18n';
import { retryFailedRecord, useRecordSyncStates } from '../../../core/sync';
import { StateView } from '../../../core/ui';
import type { Measurement, MeasurementRepository } from '../data/measurements';
import type { SessionSetupRepository } from '../data/sessionSetup';
import '../i18n';
import { CompletedScreen } from './CompletedScreen';
import { eventSubtitleOf, RosterGate, TimingSetupStep, type RosterAthlete } from './timingSession';
import { useSessionSetup } from './useSessionSetup';

export type CompletedFlowProps = {
  // For example the school name.
  subtitle: string;
  // The school the times are written for.
  schoolId: string;
  loadRoster(): Promise<RosterAthlete[]>;
  measurements: MeasurementRepository;
  // Remembers the event and the athletes between sessions; without it the setup lives only while the flow is open.
  setups?: SessionSetupRepository;
  userId: string;
  deviceId: string;
  offline?: boolean;
  onExit: () => void;
};

// Records, for each athlete of the session, that the work was done without a time ("Completado", spec 6.2.c).
export function CompletedFlow(props: CompletedFlowProps) {
  return <RosterGate loadRoster={props.loadRoster}>{(roster) => <CompletedSession {...props} roster={roster} />}</RosterGate>;
}

function CompletedSession({ subtitle, schoolId, roster, measurements, setups, userId, deviceId, offline, onExit }: CompletedFlowProps & { roster: RosterAthlete[] }) {
  const { choice, selectedIds, ready, changeChoice, changeSelected } = useSessionSetup(setups, roster);
  const [athletes, setAthletes] = useState<RosterAthlete[]>();
  // Athlete id to the id of their live completed measurement, for the event being recorded. Unticking discards that measurement and
  // ticking again writes a new one. The ref is the source of truth, so a tap right after a save never reads a stale render; the state only draws it.
  const live = useRef(new Map<string, string>());
  const [marks, setMarks] = useState<ReadonlyMap<string, string>>(new Map());
  const setLive = (change: (current: Map<string, string>) => void) => {
    change(live.current);
    setMarks(new Map(live.current));
  };
  const [error, setError] = useState<string>();
  // The athletes whose last tap is still being saved: a second tap on them waits for it.
  const saving = useRef(new Set<string>());
  const syncStates = useRecordSyncStates('measurements', [...marks.values()]);

  if (!athletes) {
    if (!ready) return <StateView kind="loading" />;
    return (
      <TimingSetupStep
        subtitle={subtitle}
        roster={roster}
        choice={choice}
        // The ticks belong to the event they were made in: another event starts with every switch off (the first one's records stay).
        onChoiceChange={(change) => {
          changeChoice(change);
          setLive((current) => current.clear());
        }}
        selectedIds={selectedIds}
        onSelectedIdsChange={changeSelected}
        sourceLabel={t('timing.source.phone')}
        onStart={setAthletes}
        onBack={onExit}
      />
    );
  }

  async function toggle(athleteId: string) {
    if (saving.current.has(athleteId)) return;
    saving.current.add(athleteId);
    try {
      const markId = live.current.get(athleteId);
      if (markId) {
        await measurements.discard(markId, userId);
        setLive((current) => current.delete(athleteId));
      } else {
        const id = randomUUID();
        await measurements.add({
          id,
          kind: 'completed',
          hundredths: null,
          athleteId,
          seriesId: null,
          arrivalPosition: null,
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
        } as Measurement);
        setLive((current) => current.set(athleteId, id));
      }
      setError(undefined);
    } catch {
      // Nothing is logged with the athlete (personal data); the switch stays as it was so the tap can be repeated.
      setError(t('timing.completed.error'));
    } finally {
      saving.current.delete(athleteId);
    }
  }

  return (
    <CompletedScreen
      subtitle={eventSubtitleOf(choice)}
      athletes={athletes.map((athlete) => {
        const id = marks.get(athlete.id);
        return { ...athlete, completed: id !== undefined, syncState: id === undefined ? undefined : (syncStates.get(id) ?? 'on_device') };
      })}
      offline={offline}
      error={error}
      onToggle={toggle}
      onRetry={(athleteId) => {
        const id = live.current.get(athleteId);
        if (id) retryFailedRecord('measurements', id).catch(() => {});
      }}
      onFinish={onExit}
      // Everything is already saved on the phone, so going back to the setup loses nothing.
      onBack={() => setAthletes(undefined)}
    />
  );
}
