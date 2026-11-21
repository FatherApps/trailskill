import { useLocalSearchParams, useRouter } from 'expo-router';

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
  // Set when the athletes were just added from "+" in Deportistas: only they are shown, outside the registration.
  const added = useLocalSearchParams<{ added?: string }>().added?.split(',').filter(Boolean);

  if (!userId || managed.status !== 'ready') return null;
  const shown = added ? managed.athletes.filter((athlete) => added.includes(athlete.id)) : managed.athletes;
  return (
    <AuthorizationsContainer
      repository={authorizations}
      userId={userId}
      refreshKey={lastSyncedAt}
      athletes={shown.map((athlete) => ({ id: athlete.id, name: athleteDisplay(athlete).shortName }))}
      mode={added ? 'added' : 'registration'}
      drafts={added ? undefined : drafts}
      identityNumbers={identityNumbers}
      identityDocuments={identityDocuments}
      onBack={goBack}
      // From "+" it returns to Deportistas, where it was opened.
      onDone={() => (added ? goBack() : router.replace('/'))}
    />
  );
}
