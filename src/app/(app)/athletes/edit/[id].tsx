import { useLocalSearchParams, useRouter } from 'expo-router';

import { useGoBack } from '../../../../core/navigation';
import { useSession } from '../../../../core/session';
import { useGlobalSyncSummary } from '../../../../core/sync';
import {
  AthleteAvatarWithPhoto,
  AthleteShareCodeContainer,
  createPowerSyncManagedAthleteRepository,
  createSecureStoreShareCodeCache,
  createSupabaseAthleteShareCodeRepository,
  useHasValidAuthorization,
} from '../../../../modules/accounts';
import {
  AthleteEditScreen,
  AthletePhotoContainer,
  athleteDisplay,
  createExpoPhotoPicker,
  createPowerSyncSchoolAthleteRepository,
  getAthletePhotoService,
  useManagedAthletes,
} from '../../../../modules/athletes';

const athletes = createPowerSyncSchoolAthleteRepository();
const managedAthletes = createPowerSyncManagedAthleteRepository();
const shareCodes = createSupabaseAthleteShareCodeRepository();
const shareCodeCache = createSecureStoreShareCodeCache();
const photoService = getAthletePhotoService();
const photoPicker = createExpoPhotoPicker();

// "Editar a <nombre>": the photo, the swimmer's data and the share code, for who manages the swimmer (a guardian or the adult athlete); the server decides the permissions.
export default function AthleteEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack('/athletes');
  const { session } = useSession();
  const summary = useGlobalSyncSummary();
  const online = summary.connection === 'connected';
  const managed = useManagedAthletes(managedAthletes, athletes, session?.user.id, summary.lastSyncedAt?.getTime());
  // The athletes module cannot read the authorization (a cycle with accounts), so the route does and passes it down.
  const showPhoto = useHasValidAuthorization(id, 'show_photo');
  const athlete = managed.status === 'ready' ? managed.athletes.find((candidate) => candidate.id === id) : undefined;

  // Nothing editable for anyone who does not manage the swimmer, and nothing until the athlete is known.
  if (!session || !athlete) return null;
  const { initials, color } = athleteDisplay(athlete);
  return (
    <AthleteEditScreen
      athleteId={id}
      firstName={athlete.firstName}
      lastName={athlete.lastName}
      onBack={goBack}
      onDone={goBack}
      photo={
        <AthletePhotoContainer
          key={`photo-${id}`}
          athleteId={id}
          userId={session.user.id}
          authorized={showPhoto}
          online={online}
          service={photoService}
          picker={photoPicker}
          avatar={<AthleteAvatarWithPhoto athleteId={id} initials={initials} color={color} size="lg" />}
          onAuthorize={() => router.push('/authorizations')}
        />
      }
      shareCode={
        <AthleteShareCodeContainer
          key={`share-code-${id}`}
          athleteId={id}
          athleteName={athlete.firstName}
          repository={shareCodes}
          cache={shareCodeCache}
          userId={session.user.id}
          online={online}
        />
      }
    />
  );
}
