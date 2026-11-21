import { useRouter } from 'expo-router';

import { useGoBack } from '../../core/navigation';
import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import {
  createPowerSyncManagedAthleteRepository,
  createSecureStorePendingInvitationRepository,
  createSecureStoreRegistrationDraftRepository,
  SignOutContainer,
} from '../../modules/accounts';
import { createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../modules/athletes';
import { SettingsContainer } from '../../modules/settings';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const registrationDrafts = createSecureStoreRegistrationDraftRepository();
const pendingInvitations = createSecureStorePendingInvitationRepository();

// "/settings": "Ajustes", the device preferences (theme and time precision) and, at the end, the account: "Autorizaciones" for a
// person who manages athletes, "Mi cuenta" and "Cerrar sesión" with the same warning about unsent records.
export default function SettingsRoute() {
  const goBack = useGoBack('/');
  const router = useRouter();
  const { session } = useSession();
  const lastSyncedAt = useGlobalSyncSummary().lastSyncedAt?.getTime();
  // Managed athletes arrive with a sync, so the lookup runs again when one completes.
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, session?.user.id, lastSyncedAt);
  const managesAthletes = managed.status === 'ready' && managed.athletes.length > 0;
  return (
    <SettingsContainer
      onBack={goBack}
      onOpenAccount={() => router.push('/account')}
      onOpenAuthorizations={managesAthletes ? () => router.push('/authorizations') : undefined}
      signOut={<SignOutContainer drafts={registrationDrafts} pending={pendingInvitations} />}
    />
  );
}
