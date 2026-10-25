import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';

import { useSession } from '../../core/session';
import { db, useGlobalSyncSummary } from '../../core/sync';
import { createPowerSyncAuthorizationStatusRepository } from '../../modules/accounts';
import { athleteDisplay, createPowerSyncSchoolAthleteRepository } from '../../modules/athletes';
import { createPowerSyncStaffSchoolRepository, useStaffSchool } from '../../modules/school-console';
import { createPowerSyncMeasurementRepository, IndividualTimingFlow, type RosterAthlete } from '../../modules/timing';

const staffSchools = createPowerSyncStaffSchoolRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const authorizations = createPowerSyncAuthorizationStatusRepository();
const measurements = createPowerSyncMeasurementRepository();

// The athletes on this device (the sync streams already limit them to the ones this person may see) and who allowed recording times.
async function loadRoster(): Promise<RosterAthlete[]> {
  const [athletes, granted] = await Promise.all([schoolAthletes.listAll(), authorizations.listGrantedAthleteIds('record_times')]);
  return athletes.map((athlete, index) => ({ id: athlete.id, ...athleteDisplay(athlete, index), authorized: granted.includes(athlete.id) }));
}

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

export default function TimingRoute() {
  const { session } = useSession();
  const lastSyncedAt = useGlobalSyncSummary().lastSyncedAt?.getTime();
  const access = useStaffSchool(staffSchools, session?.user.id, lastSyncedAt);
  const [deviceId, setDeviceId] = useState<string>();
  useEffect(() => {
    db.getClientId()
      .then(setDeviceId)
      .catch(() => {});
  }, []);

  if (access.status === 'loading') return null;
  // Only a hidden button is not protection: the backend enforces who may record times.
  if (access.status === 'denied' || !session) return <Redirect href="/" />;
  if (!deviceId) return null;
  return (
    <IndividualTimingFlow
      subtitle={access.school.name}
      loadRoster={loadRoster}
      measurements={measurements}
      userId={session.user.id}
      deviceId={deviceId}
      onExit={leave}
    />
  );
}
