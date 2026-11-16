import { Redirect, useRouter } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { t } from '../../core/i18n';
import { useGoBack } from '../../core/navigation';
import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { useTheme } from '../../core/theme';
import { Button, StateView } from '../../core/ui';
import {
  createSecureStorePendingInvitationRepository,
  createSecureStoreRegistrationDraftRepository,
  SignOutContainer,
} from '../../modules/accounts';
import { athleteProfileHref } from '../../modules/athletes';
import {
  createPowerSyncConsoleAthletesRepository,
  createPowerSyncStaffSchoolRepository,
  MySwimmersSection,
  StaffEntries,
  useCoachSchool,
} from '../../modules/school-console';

const staffSchools = createPowerSyncStaffSchoolRepository();
const consoleAthletes = createPowerSyncConsoleAthletesRepository();
const registrationDrafts = createSecureStoreRegistrationDraftRepository();
const pendingInvitations = createSecureStorePendingInvitationRepository();

// "/my-swimmers": the athletes assigned to the coach. Hiding the entry is not protection: a user who is not a coach of a school
// leaves this route, and the backend still decides which athletes reach the device.
export default function MySwimmersRoute() {
  const router = useRouter();
  const goBack = useGoBack('/');
  const { session } = useSession();
  const { width } = useWindowDimensions();
  const { colors, space } = useTheme();
  // Memberships and assignments arrive with a sync, so the lookups run again when one completes.
  const { lastSyncedAt, connection } = useGlobalSyncSummary();
  const access = useCoachSchool(staffSchools, session?.user.id, lastSyncedAt?.getTime());
  const frame = { flex: 1, justifyContent: 'center', padding: space[4], backgroundColor: colors['surface-0'] } as const;

  if (access.status === 'loading') {
    return (
      <View style={frame}>
        <StateView kind="loading" />
      </View>
    );
  }
  if (access.status === 'denied') return <Redirect href="/" />;
  // A failed lookup says nothing about the role: it offers to look again instead of leaving.
  if (access.status === 'error') {
    return (
      <View style={frame}>
        <StateView
          kind="error"
          title={t('schoolConsole.screen.access_error_title')}
          message={t('schoolConsole.screen.access_error_message')}
          action={{ label: t('schoolConsole.screen.retry'), onPress: access.retry }}
        />
        <View style={{ alignItems: 'center', marginTop: space[4] }}>
          <Button variant="ghost" label={t('schoolConsole.screen.access_error_home')} onPress={() => router.replace('/')} />
        </View>
      </View>
    );
  }
  return (
    <MySwimmersSection
      width={width}
      schoolName={access.school.name}
      schoolId={access.school.id}
      coachUserId={session!.user.id}
      repository={consoleAthletes}
      refreshKey={lastSyncedAt?.getTime()}
      lastSyncedAt={lastSyncedAt}
      connection={connection}
      onOpenAthlete={(id, name) => router.push(athleteProfileHref(id, name))}
      onBack={goBack}
      // The coach lands here instead of on the home screen, so the entries only the home screen had are here too.
      footer={
        <StaffEntries onOpen={(href) => router.push(href)}>
          <SignOutContainer drafts={registrationDrafts} pending={pendingInvitations} />
        </StaffEntries>
      }
    />
  );
}
