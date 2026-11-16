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
      // "Salir" and the Android back button leave through the same action. The registration reaches this route with `replace`, so with no history it falls back to the role landing ('/'); from "+" in Deportistas it returns there.
      onExit={goBack}
      renderStatus={(id) => <RecordSyncStatus table="athletes" id={id} />}
      onContinue={() => router.replace('/athletes/authorizations')}
    />
  );
}
