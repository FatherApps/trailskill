import { useRouter } from 'expo-router';

import { useGoBack } from '../../../core/navigation';
import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import {
  AuthorizationsContainer,
  createPowerSyncAuthorizationRepository,
  createPowerSyncManagedAthleteRepository,
  createSecureStoreRegistrationDraftRepository,
  createSupabaseIdentityDocumentRepository,
  identityNumbers,
} from '../../../modules/accounts';
import { athleteDisplay, createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../../modules/athletes';

const authorizations = createPowerSyncAuthorizationRepository();
const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const drafts = createSecureStoreRegistrationDraftRepository();
const identityDocuments = createSupabaseIdentityDocumentRepository();

// Last step of registration: authorize each purpose for each athlete, or continue without authorizing.
export default function RegistrationAuthorizations() {
  const router = useRouter();
  const goBack = useGoBack();
  const { session } = useSession();
  const userId = session?.user.id;
  const lastSyncedAt = useGlobalSyncSummary().lastSyncedAt?.getTime();
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, userId, lastSyncedAt);

  if (!userId || managed.status !== 'ready') return null;
  return (
    <AuthorizationsContainer
      repository={authorizations}
      userId={userId}
      refreshKey={lastSyncedAt}
      athletes={managed.athletes.map((athlete) => ({ id: athlete.id, name: athleteDisplay(athlete).shortName }))}
      mode="registration"
      drafts={drafts}
      identityNumbers={identityNumbers}
      identityDocuments={identityDocuments}
      onBack={goBack}
      onDone={() => router.replace('/')}
    />
  );
}
