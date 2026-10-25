import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useSession } from '../../core/session';
import { db, useGlobalSyncSummary } from '../../core/sync';
import { createPowerSyncAuthorizationStatusRepository } from '../../modules/accounts';
import { athleteDisplay, createPowerSyncHistoryRepository, createPowerSyncSchoolAthleteRepository, personalBestTime } from '../../modules/athletes';
import { createPowerSyncStaffSchoolRepository, useStaffSchool } from '../../modules/school-console';
import {
  createPowerSyncMeasurementRepository,
  createPowerSyncSeriesRepository,
  CompletedFlow,
  createSecureStoreSessionSetupRepository,
  IndividualTimingFlow,
  SeriesTimingFlow,
  type MeasurementEvent,
  type RosterAthlete,
} from '../../modules/timing';

const staffSchools = createPowerSyncStaffSchoolRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const authorizations = createPowerSyncAuthorizationStatusRepository();
const measurements = createPowerSyncMeasurementRepository();
const seriesRepository = createPowerSyncSeriesRepository();
const history = createPowerSyncHistoryRepository();
const sessionSetups = createSecureStoreSessionSetupRepository();

// The athletes on this device (the sync streams already limit them to the ones this person may see) and who allowed recording times.
// Without a granted record_times the flow skips the athlete: the backend would reject the time for good.
async function loadRoster(): Promise<RosterAthlete[]> {
  const [athletes, granted] = await Promise.all([schoolAthletes.listAll(), authorizations.listGrantedAthleteIds('record_times')]);
  return athletes.map((athlete, index) => ({ id: athlete.id, ...athleteDisplay(athlete, index), authorized: granted.includes(athlete.id) }));
}

// The best time on this device for the event, shown against the time just stopped.
const loadBestTime = (athleteId: string, event: MeasurementEvent) => personalBestTime(history, athleteId, event);

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

// "/timing" times one athlete at a time; "/timing?mode=series" times a group that starts together;
// "/timing?mode=completed" records that the work was done, without a time.
export default function TimingRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { session } = useSession();
  const lastSyncedAt = useGlobalSyncSummary().lastSyncedAt?.getTime();
  const access = useStaffSchool(staffSchools, session?.user.id, lastSyncedAt);
  const [deviceId, setDeviceId] = useState<string>();
  useEffect(() => {
    db.getClientId()
      .then(setDeviceId)
      .catch(() => {});
  }, []);

  // A new function after each sync makes the flow reload the roster, so a withdrawal that arrives marks the athlete "se omitirá" at once.
  // The sync time is not read by the loader: it is only what makes the function new.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const syncedRoster = useCallback(() => loadRoster(), [lastSyncedAt]);

  if (access.status === 'loading') return null;
  // Only a hidden button is not protection: the backend enforces who may record times.
  if (access.status === 'denied' || !session) return <Redirect href="/" />;
  if (!deviceId) return null;
  const flow = { subtitle: access.school.name, loadRoster: syncedRoster, userId: session.user.id, deviceId, setups: sessionSetups, onExit: leave };
  if (mode === 'series') return <SeriesTimingFlow {...flow} series={seriesRepository} />;
  if (mode === 'completed') return <CompletedFlow {...flow} measurements={measurements} />;
  return <IndividualTimingFlow {...flow} measurements={measurements} loadBestTime={loadBestTime} />;
}
