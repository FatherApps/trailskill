import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';

import { useSession } from '../../core/session';
import { db, useGlobalSyncSummary } from '../../core/sync';
import { athleteDisplay, createPowerSyncSchoolAthleteRepository } from '../../modules/athletes';
import { createPowerSyncStaffSchoolRepository, useStaffSchool } from '../../modules/school-console';
import { createPowerSyncMeasurementRepository, IndividualTimingFlow, type RosterAthlete } from '../../modules/timing';

const staffSchools = createPowerSyncStaffSchoolRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const measurements = createPowerSyncMeasurementRepository();

// The athletes on this device: the sync streams already limit them to the ones this person may see.
// shortcut: everyone is timed, because skipping athletes without a valid authorization ("se omitirá", #53) waits for #43; the backend still decides what it accepts.
async function loadRoster(): Promise<RosterAthlete[]> {
  const athletes = await schoolAthletes.listAll();
  return athletes.map((athlete, index) => ({ id: athlete.id, ...athleteDisplay(athlete, index), authorized: true }));
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
