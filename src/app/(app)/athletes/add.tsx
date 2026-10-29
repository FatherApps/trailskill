import { useRouter } from 'expo-router';

import { useGoBack } from '../../../core/navigation';
import { useSession } from '../../../core/session';
import { RecordSyncStatus } from '../../../core/sync';
import {
  AddAthletesContainer,
  createPowerSyncManagedAthleteProfileRepository,
  createPowerSyncManagedAthleteRepository,
  createSecureStorePendingInvitationRepository,
  createSecureStoreRegistrationDraftRepository,
  createSupabaseInvitationRepository,
  identityNumbers,
} from '../../../modules/accounts';
import { createPowerSyncAthleteRepository, createPowerSyncSchoolAthleteRepository } from '../../../modules/athletes';

const athletes = createPowerSyncAthleteRepository(createPowerSyncManagedAthleteRepository(), createPowerSyncSchoolAthleteRepository());
const drafts = createSecureStoreRegistrationDraftRepository();
const invitations = createSupabaseInvitationRepository();
const pending = createSecureStorePendingInvitationRepository();
const profiles = createPowerSyncManagedAthleteProfileRepository(athletes);

export default function AddAthletesRoute() {
  const router = useRouter();
  const goBack = useGoBack();
  const { session } = useSession();

  if (!session) return null;
  return (
    <AddAthletesContainer
      userId={session.user.id}
      profiles={profiles}
      athletes={athletes}
      drafts={drafts}
      invitations={invitations}
      pending={pending}
      identityNumbers={identityNumbers}
      // The account exists already: back must not drop the person on a half-done registration.
      blockSystemBack
      onBack={goBack}
      renderStatus={(id) => <RecordSyncStatus table="athletes" id={id} />}
      onContinue={() => router.replace('/athletes/authorizations')}
    />
  );
}
