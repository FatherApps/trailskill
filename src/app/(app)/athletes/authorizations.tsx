import { useRouter } from 'expo-router';

import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import {
  AuthorizationsContainer,
  createPowerSyncAuthorizationRepository,
  createPowerSyncManagedAthleteRepository,
  createSecureStoreRegistrationDraftRepository,
} from '../../../modules/accounts';
import { athleteDisplay, createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../../modules/athletes';

const authorizations = createPowerSyncAuthorizationRepository();
const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const drafts = createSecureStoreRegistrationDraftRepository();

// Last step of registration: authorize each purpose for each athlete, or continue without authorizing.
export default function RegistrationAuthorizations() {
  const router = useRouter();
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
      athletes={managed.athletes.map((athlete, index) => ({ id: athlete.id, name: athleteDisplay(athlete, index).shortName }))}
      mode="registration"
      drafts={drafts}
      // Reached with replace, so back may have no history: it goes home.
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onDone={() => router.replace('/')}
    />
  );
}
