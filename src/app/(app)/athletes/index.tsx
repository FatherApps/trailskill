import { useRouter } from 'expo-router';

import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import { createPowerSyncManagedAthleteRepository } from '../../../modules/accounts';
import {
  createPowerSyncAthleteSchoolRepository,
  createPowerSyncSchoolAthleteRepository,
  MyAthletesContainer,
} from '../../../modules/athletes';
import { createPowerSyncSchoolStructureRepository } from '../../../modules/school-console';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const schoolLinks = createPowerSyncAthleteSchoolRepository();
const structure = createPowerSyncSchoolStructureRepository();

// "Mis deportistas": one colour card per athlete the user manages; a card opens the profile.
export default function MyAthletesRoute() {
  const router = useRouter();
  const { session } = useSession();
  const { lastSyncedAt } = useGlobalSyncSummary();

  // The root layout already pads the system bars.
  return (
    <MyAthletesContainer
      userId={session?.user.id}
      managed={managedAthletes}
      athletes={schoolAthletes}
      schoolLinks={schoolLinks}
      structure={structure}
      refreshKey={lastSyncedAt?.getTime()}
      onOpen={(id) => router.push(`/athletes/${id}`)}
    />
  );
}
