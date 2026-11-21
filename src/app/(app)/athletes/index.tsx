import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import {
  createPowerSyncAuthorizationStatusRepository,
  createPowerSyncManagedAthleteRepository,
  AthleteAvatarWithPhoto,
  AthleteShareCodeChipContainer,
  createSecureStoreShareCodeCache,
  createSupabaseAthleteShareCodeRepository,
} from '../../../modules/accounts';
import {
  athleteProfileHref,
  createPowerSyncAthleteSchoolRepository,
  createPowerSyncSchoolAthleteRepository,
  MyAthletesContainer,
  useAthleteNamesVersion,
} from '../../../modules/athletes';
import { createPowerSyncSchoolNameRepository, createPowerSyncSchoolStructureRepository } from '../../../modules/school-console';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const authorizations = createPowerSyncAuthorizationStatusRepository();
const schoolNames = createPowerSyncSchoolNameRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const schoolLinks = createPowerSyncAthleteSchoolRepository();
const structure = createPowerSyncSchoolStructureRepository();
const shareCodes = createSupabaseAthleteShareCodeRepository();
const shareCodeCache = createSecureStoreShareCodeCache();

// The share-code chip of one card; a module-level component so the cards keep it mounted between renders.
function ShareCodeChip({ athleteId }: { athleteId: string }) {
  const { session } = useSession();
  const { connection } = useGlobalSyncSummary();
  return (
    <AthleteShareCodeChipContainer
      athleteId={athleteId}
      repository={shareCodes}
      cache={shareCodeCache}
      userId={session?.user.id}
      online={connection === 'connected'}
    />
  );
}

// "Mis deportistas": one colour card per athlete the user manages; a card opens the profile. "Autorizaciones" and "Cerrar sesión" live in "Ajustes" (#778).
export default function MyAthletesRoute() {
  const router = useRouter();
  const { session } = useSession();
  const { lastSyncedAt } = useGlobalSyncSummary();
  // A rename saved on the Editar screen (still open under this one) is a local write: the version makes the cards read it right away.
  const namesVersion = useAthleteNamesVersion();

  // The root layout already pads the system bars.
  return (
    <View style={{ flex: 1 }}>
      <MyAthletesContainer
        Avatar={AthleteAvatarWithPhoto}
        ShareCode={ShareCodeChip}
        userId={session?.user.id}
        managed={managedAthletes}
        athletes={schoolAthletes}
        schoolLinks={schoolLinks}
        schoolNames={schoolNames}
        structure={structure}
        authorizations={authorizations}
        refreshKey={`${lastSyncedAt?.getTime()}:${namesVersion}`}
        onOpen={(id, name) => router.push(athleteProfileHref(id, name))}
        onEdit={(id) => router.push(`/athletes/edit/${id}`)}
        onAdd={() => router.push({ pathname: '/athletes/add', params: { mode: 'add' } })}
      />
    </View>
  );
}
