import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { t } from '../../../../core/i18n';

import { useGoBack } from '../../../../core/navigation';
import { useSession } from '../../../../core/session';
import { useGlobalSyncSummary } from '../../../../core/sync';
import { useTheme } from '../../../../core/theme';
import { BackButton, StateView } from '../../../../core/ui';
import {
  AthleteAvatarWithPhoto,
  AthleteIdentityNumberContainer,
  AthleteShareCodeContainer,
  createPowerSyncManagedAthleteRepository,
  createSecureStoreShareCodeCache,
  createSupabaseAthleteShareCodeRepository,
  createSupabaseIdentityDocumentRepository,
  useHasValidAuthorization,
} from '../../../../modules/accounts';
import {
  AthleteEditScreen,
  AthleteNameContainer,
  AthletePhotoContainer,
  athleteDisplay,
  createExpoPhotoPicker,
  createPowerSyncAthleteRepository,
  createPowerSyncSchoolAthleteRepository,
  getAthletePhotoService,
  useAthleteNamesVersion,
  useManagedAthletes,
} from '../../../../modules/athletes';

const athletes = createPowerSyncSchoolAthleteRepository();
const managedAthletes = createPowerSyncManagedAthleteRepository();
const identityDocuments = createSupabaseIdentityDocumentRepository();
const athleteProfiles = createPowerSyncAthleteRepository(managedAthletes, athletes);
const shareCodes = createSupabaseAthleteShareCodeRepository();
const shareCodeCache = createSecureStoreShareCodeCache();
const photoService = getAthletePhotoService();
const photoPicker = createExpoPhotoPicker();

// "Editar a <nombre>": the photo, the swimmer's data (identity number included) and the share code, for who manages the swimmer (a guardian or the adult athlete); the server decides the permissions.
export default function AthleteEditRoute() {
  const { space, colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack('/athletes');
  const { session } = useSession();
  const summary = useGlobalSyncSummary();
  const online = summary.connection === 'connected';
  // A rename is a local write: the version makes this list, and so the title, read the database again right after the save.
  const namesVersion = useAthleteNamesVersion();
  const managed = useManagedAthletes(managedAthletes, athletes, session?.user.id, `${summary.lastSyncedAt?.getTime()}:${namesVersion}`);
  // The athletes module cannot read the authorization (a cycle with accounts), so the route does and passes it down.
  const showPhoto = useHasValidAuthorization(id, 'show_photo');
  const importOfficialResults = useHasValidAuthorization(id, 'import_official_results');
  const athlete = managed.status === 'ready' ? managed.athletes.find((candidate) => candidate.id === id) : undefined;

  if (!session) return null;
  // Nothing editable until the athlete is known, nor for anyone who does not manage the swimmer (a deep link): the screen keeps its way back.
  if (!athlete) {
    return (
      <View style={{ flex: 1, alignSelf: 'stretch', padding: space[4], gap: space[4], backgroundColor: colors['surface-0'] }}>
        <View style={{ flexDirection: 'row' }}>
          <BackButton onPress={goBack} />
        </View>
        {managed.status === 'loading' ? (
          <StateView kind="loading" />
        ) : (
          <StateView kind="empty" icon="group" title={t('athletes.edit.not_found.title')} message={t('athletes.edit.not_found.message')} />
        )}
      </View>
    );
  }
  const { initials, color } = athleteDisplay(athlete);
  return (
    <AthleteEditScreen
      athleteId={id}
      firstName={athlete.firstName}
      lastName={athlete.lastName}
      onBack={goBack}
      onDone={goBack}
      name={<AthleteNameContainer key={`name-${id}`} athleteId={id} firstName={athlete.firstName} lastName={athlete.lastName} repository={athleteProfiles} />}
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
      identity={
        <AthleteIdentityNumberContainer
          key={`identity-${id}`}
          athleteId={id}
          repository={identityDocuments}
          authorized={importOfficialResults}
          online={online}
          onGoToAuthorizations={() => router.push('/authorizations')}
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
