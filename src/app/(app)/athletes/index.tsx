import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { t } from '../../../core/i18n';
import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/ui';
import {
  createPowerSyncAuthorizationStatusRepository,
  createPowerSyncManagedAthleteRepository,
  createSecureStorePendingInvitationRepository,
  createSecureStoreRegistrationDraftRepository,
  SignOutContainer,
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
const registrationDrafts = createSecureStoreRegistrationDraftRepository();
const pendingInvitations = createSecureStorePendingInvitationRepository();

// "Mis deportistas": one colour card per athlete the user manages; a card opens the profile.
export default function MyAthletesRoute() {
  const router = useRouter();
  const { session } = useSession();
  const { lastSyncedAt } = useGlobalSyncSummary();
  const { space } = useTheme();

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
      {/* Bridge: a guardian and an adult athlete land here and have no other way to sign out or manage authorizations; the account screen (#778) takes these two out. */}
      {/* The floating phone bar rests on the bottom edge: the two buttons stay above it, as the last rows of the other screens do. */}
      <View style={{ padding: space[4], paddingBottom: space[12] * 2, gap: space[3] }}>
        <Button variant="secondary" label={t('accounts.authorizations.title')} onPress={() => router.push('/authorizations')} />
        <SignOutContainer drafts={registrationDrafts} pending={pendingInvitations} />
      </View>
    </View>
  );
}
