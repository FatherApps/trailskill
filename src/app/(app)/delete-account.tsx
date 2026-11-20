import { useGoBack } from '../../core/navigation';
import { useGlobalSyncSummary } from '../../core/sync';
import {
  createSecureStorePendingInvitationRepository,
  createSecureStoreRegistrationDraftRepository,
  createSupabaseAccountDeletionRepository,
  DeleteAccountContainer,
} from '../../modules/accounts';

const accountDeletion = createSupabaseAccountDeletionRepository();
const registrationDrafts = createSecureStoreRegistrationDraftRepository();
const pendingInvitations = createSecureStorePendingInvitationRepository();

// "/delete-account": "Eliminar mis datos". No exporter yet: the export of the person's data is its own issue, and the offer shows its button once one is given.
export default function DeleteAccountRoute() {
  const goBack = useGoBack('/account');
  const { connection } = useGlobalSyncSummary();
  return (
    <DeleteAccountContainer
      repository={accountDeletion}
      online={connection !== 'offline'}
      drafts={registrationDrafts}
      pending={pendingInvitations}
      onBack={goBack}
    />
  );
}
