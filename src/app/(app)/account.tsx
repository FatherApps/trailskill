import { useRouter } from 'expo-router';

import { useGoBack } from '../../core/navigation';
import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import {
  AccountContainer,
  createPowerSyncManagedAthleteRepository,
  createSecureStorePendingInvitationRepository,
  createSecureStoreRegistrationDraftRepository,
} from '../../modules/accounts';
import { createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../modules/athletes';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const registrationDrafts = createSecureStoreRegistrationDraftRepository();
const pendingInvitations = createSecureStorePendingInvitationRepository();

// "/account": "Mi cuenta", with "Autorizaciones" for a person who manages athletes, "Cerrar sesión" and "Eliminar mis datos".
export default function AccountRoute() {
  const goBack = useGoBack('/settings');
  const router = useRouter();
  const { session } = useSession();
  const lastSyncedAt = useGlobalSyncSummary().lastSyncedAt?.getTime();
  // Managed athletes arrive with a sync, so the lookup runs again when one completes.
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, session?.user.id, lastSyncedAt);
  const managesAthletes = managed.status === 'ready' && managed.athletes.length > 0;
  return (
    <AccountContainer
      drafts={registrationDrafts}
      pending={pendingInvitations}
      onOpenAuthorizations={managesAthletes ? () => router.push('/authorizations') : undefined}
      onDelete={() => router.push('/delete-account')}
      onBack={goBack}
    />
  );
}
