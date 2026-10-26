import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useSession } from '../../core/session';
import { db, useGlobalSyncSummary } from '../../core/sync';
import { createPowerSyncAuthorizationStatusRepository } from '../../modules/accounts';
import { athleteDisplay, createPowerSyncHistoryRepository, createPowerSyncSchoolAthleteRepository, personalBestTime } from '../../modules/athletes';
import { createPowerSyncStaffSchoolRepository, useStaffSchool, type StaffSchool } from '../../modules/school-console';
import {
  createPowerSyncMeasurementRepository,
  createPowerSyncSeriesRepository,
  CompletedFlow,
  createSecureStoreSessionSetupRepository,
  IndividualTimingFlow,
  SchoolChoiceScreen,
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

// The athletes of the school being timed and who allowed recording times. Only that school's: the backend rejects for good a time
// whose athlete is not in the time's school. Without a granted record_times the flow skips the athlete for the same reason.
async function loadSchoolRoster(schoolId: string): Promise<RosterAthlete[]> {
  const [athletes, granted] = await Promise.all([schoolAthletes.listBySchool(schoolId), authorizations.listGrantedAthleteIds('record_times')]);
  return athletes.map((athlete, index) => ({ id: athlete.id, ...athleteDisplay(athlete, index), authorized: granted.includes(athlete.id) }));
}

// The best time on this device for the event, shown against the time just stopped.
const loadBestTime = (athleteId: string, event: MeasurementEvent) => personalBestTime(history, athleteId, event);

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

// The flow of the school every time is written for.
function SchoolTiming({ school, mode, userId, deviceId, lastSyncedAt }: { school: StaffSchool; mode?: string; userId: string; deviceId: string; lastSyncedAt?: number }) {
  // The flow loads the roster again whenever this function changes: new per school and after each sync, so a withdrawal that arrives
  // marks the athlete "se omitirá" at once. The sync time is not read by the loader: it is only what makes the function new.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadRoster = useCallback(() => loadSchoolRoster(school.id), [school.id, lastSyncedAt]);
  const flow = { subtitle: school.name, schoolId: school.id, loadRoster, userId, deviceId, setups: sessionSetups, onExit: leave };
  if (mode === 'series') return <SeriesTimingFlow {...flow} series={seriesRepository} loadBestTime={loadBestTime} />;
  if (mode === 'completed') return <CompletedFlow {...flow} measurements={measurements} />;
  return <IndividualTimingFlow {...flow} measurements={measurements} loadBestTime={loadBestTime} />;
}

// "/timing" times one athlete at a time; "/timing?mode=series" times a group that starts together;
// "/timing?mode=completed" records that the work was done, without a time.
export default function TimingRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { session } = useSession();
  const lastSyncedAt = useGlobalSyncSummary().lastSyncedAt?.getTime();
  const access = useStaffSchool(staffSchools, session?.user.id, lastSyncedAt);
  const [deviceId, setDeviceId] = useState<string>();
  // Kept only while this screen is open; with a single school there is nothing to choose.
  const [chosenSchoolId, setChosenSchoolId] = useState<string>();
  useEffect(() => {
    db.getClientId()
      .then(setDeviceId)
      .catch(() => {});
  }, []);

  if (access.status === 'loading') return null;
  // Only a hidden button is not protection: the backend enforces who may record times.
  if (access.status === 'denied' || !session) return <Redirect href="/" />;
  if (!deviceId) return null;
  const school = access.schools.length === 1 ? access.schools[0] : access.schools.find(({ id }) => id === chosenSchoolId);
  if (!school) return <SchoolChoiceScreen schools={access.schools} onChoose={setChosenSchoolId} onBack={leave} />;
  return <SchoolTiming school={school} mode={mode} userId={session.user.id} deviceId={deviceId} lastSyncedAt={lastSyncedAt} />;
}
