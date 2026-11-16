import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { useGoBack } from '../../../core/navigation';
import { useSession } from '../../../core/session';
import { db, useGlobalSyncSummary } from '../../../core/sync';
import { createPowerSyncAuthorizationStatusRepository, type AuthorizationStatusRepository } from '../../accounts';
import {
  athleteDisplay,
  createPowerSyncHistoryRepository,
  createPowerSyncSchoolAthleteRepository,
  personalBestTime,
  type HistoryRepository,
  type SchoolAthleteRepository,
} from '../../athletes';
import {
  CompletedFlow,
  createPowerSyncMeasurementRepository,
  createPowerSyncSeriesRepository,
  createSecureStoreSessionSetupRepository,
  IndividualTimingFlow,
  SchoolChoiceScreen,
  SeriesTimingFlow,
  type MeasurementEvent,
  type MeasurementRepository,
  type RosterAthlete,
  type SeriesRepository,
  type SessionSetupRepository,
} from '../../timing';
import { createPowerSyncStaffSchoolRepository, type StaffSchool, type StaffSchoolRepository } from '../data/staffSchools';
import { useStaffSchool } from '../data/useAdminSchool';

export type SchoolTimingRepositories = {
  staffSchools: StaffSchoolRepository;
  schoolAthletes: SchoolAthleteRepository;
  authorizations: AuthorizationStatusRepository;
  measurements: MeasurementRepository;
  series: SeriesRepository;
  history: HistoryRepository;
  sessionSetups: SessionSetupRepository;
};

// Built on first use, so importing the module opens nothing; the PowerSync implementations are the default, tests pass in-memory ones.
let powerSync: SchoolTimingRepositories | undefined;
function powerSyncRepositories(): SchoolTimingRepositories {
  powerSync ??= {
    staffSchools: createPowerSyncStaffSchoolRepository(),
    schoolAthletes: createPowerSyncSchoolAthleteRepository(),
    authorizations: createPowerSyncAuthorizationStatusRepository(),
    measurements: createPowerSyncMeasurementRepository(),
    series: createPowerSyncSeriesRepository(),
    history: createPowerSyncHistoryRepository(),
    sessionSetups: createSecureStoreSessionSetupRepository(),
  };
  return powerSync;
}

// The athletes of the school being timed and who allowed recording times. Only that school's: the backend rejects for good a time
// whose athlete is not in the time's school. Without a granted record_times the flow skips the athlete for the same reason.
async function loadSchoolRoster({ schoolAthletes, authorizations }: SchoolTimingRepositories, schoolId: string): Promise<RosterAthlete[]> {
  const [athletes, granted] = await Promise.all([schoolAthletes.listBySchool(schoolId), authorizations.listGrantedAthleteIds('record_times')]);
  return athletes.map((athlete) => ({ id: athlete.id, ...athleteDisplay(athlete), authorized: granted.includes(athlete.id) }));
}

type FlowProps = { school: StaffSchool; mode?: string; userId: string; deviceId: string; lastSyncedAt?: number; repositories: SchoolTimingRepositories };

// The flow of the school every time is written for.
function SchoolTiming({ school, mode, userId, deviceId, lastSyncedAt, repositories }: FlowProps) {
  const leave = useGoBack();
  // The flow loads the roster again whenever this function changes: new per school and after each sync, so a withdrawal that arrives
  // marks the athlete "se omitirá" at once. The sync time is not read by the loader: it is only what makes the function new.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadRoster = useCallback(() => loadSchoolRoster(repositories, school.id), [school.id, lastSyncedAt]);
  // The best time on this device for the event, shown against the time just stopped.
  const loadBestTime = (athleteId: string, event: MeasurementEvent) => personalBestTime(repositories.history, athleteId, event);
  const flow = { subtitle: school.name, schoolId: school.id, loadRoster, userId, deviceId, setups: repositories.sessionSetups, onExit: leave };
  if (mode === 'series') return <SeriesTimingFlow {...flow} series={repositories.series} loadBestTime={loadBestTime} />;
  if (mode === 'completed') return <CompletedFlow {...flow} measurements={repositories.measurements} />;
  return <IndividualTimingFlow {...flow} measurements={repositories.measurements} loadBestTime={loadBestTime} />;
}

export type SchoolTimingContainerProps = {
  // "series" times a group that starts together, "completed" records that the work was done without a time, anything else times one athlete.
  mode?: string;
  // Shown instead of the flow to a user who may not record times (not school staff, signed out or a failed lookup).
  denied: ReactNode;
  repositories?: SchoolTimingRepositories;
};

// Times the athletes of the school of the signed-in staff member; with several schools they choose which one first.
export function SchoolTimingContainer({ mode, denied, repositories = powerSyncRepositories() }: SchoolTimingContainerProps) {
  const leave = useGoBack();
  const { session } = useSession();
  const lastSyncedAt = useGlobalSyncSummary().lastSyncedAt?.getTime();
  const access = useStaffSchool(repositories.staffSchools, session?.user.id, lastSyncedAt);
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
  if (access.status === 'denied' || access.status === 'error' || !session) return <>{denied}</>;
  if (!deviceId) return null;
  const school = access.schools.length === 1 ? access.schools[0] : access.schools.find(({ id }) => id === chosenSchoolId);
  if (!school) return <SchoolChoiceScreen schools={access.schools} onChoose={setChosenSchoolId} onBack={leave} />;
  return <SchoolTiming school={school} mode={mode} userId={session.user.id} deviceId={deviceId} lastSyncedAt={lastSyncedAt} repositories={repositories} />;
}
