import { router } from 'expo-router';

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
  const { session } = useSession();
  const userId = session?.user.id;
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, userId, useGlobalSyncSummary().lastSyncedAt?.getTime());

  if (!userId || managed.status !== 'ready') return null;
  return (
    <AuthorizationsContainer
      repository={authorizations}
      userId={userId}
      athletes={managed.athletes.map((athlete, index) => ({ id: athlete.id, name: athleteDisplay(athlete, index).shortName }))}
      mode="registration"
      drafts={drafts}
      onBack={() => router.back()}
      onDone={() => router.replace('/')}
    />
  );
}
