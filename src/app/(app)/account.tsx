import { useRouter } from 'expo-router';

import { useGoBack } from '../../core/navigation';
import { AccountContainer, createSecureStorePendingInvitationRepository, createSecureStoreRegistrationDraftRepository } from '../../modules/accounts';

const registrationDrafts = createSecureStoreRegistrationDraftRepository();
const pendingInvitations = createSecureStorePendingInvitationRepository();

// "/account": "Mi cuenta", with "Cerrar sesión" and "Eliminar mis datos".
export default function AccountRoute() {
  const goBack = useGoBack('/settings');
  const router = useRouter();
  return <AccountContainer drafts={registrationDrafts} pending={pendingInvitations} onDelete={() => router.push('/delete-account')} onBack={goBack} />;
}
