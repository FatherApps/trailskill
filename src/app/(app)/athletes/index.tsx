import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import {
  createPowerSyncAuthorizationStatusRepository,
  createPowerSyncManagedAthleteRepository,
  AthleteAvatarWithPhoto,
} from '../../../modules/accounts';
import {
  athleteProfileHref,
  createPowerSyncAthleteSchoolRepository,
  createPowerSyncSchoolAthleteRepository,
  MyAthletesContainer,
} from '../../../modules/athletes';
import { createPowerSyncSchoolNameRepository, createPowerSyncSchoolStructureRepository } from '../../../modules/school-console';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const authorizations = createPowerSyncAuthorizationStatusRepository();
const schoolNames = createPowerSyncSchoolNameRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const schoolLinks = createPowerSyncAthleteSchoolRepository();
const structure = createPowerSyncSchoolStructureRepository();

// "Mis deportistas": one colour card per athlete the user manages; a card opens the profile. "Autorizaciones" and "Cerrar sesión" live in "Ajustes" (#778).
export default function MyAthletesRoute() {
  const router = useRouter();
  const { session } = useSession();
  const { lastSyncedAt } = useGlobalSyncSummary();

  // The root layout already pads the system bars.
  return (
    <View style={{ flex: 1 }}>
      <MyAthletesContainer
        Avatar={AthleteAvatarWithPhoto}
        userId={session?.user.id}
        managed={managedAthletes}
        athletes={schoolAthletes}
        schoolLinks={schoolLinks}
        schoolNames={schoolNames}
        structure={structure}
        authorizations={authorizations}
        refreshKey={lastSyncedAt?.getTime()}
        onOpen={(id, name) => router.push(athleteProfileHref(id, name))}
        onAdd={() => router.push({ pathname: '/athletes/add', params: { mode: 'add' } })}
      />
    </View>
  );
}
