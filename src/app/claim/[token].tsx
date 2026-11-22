import { useLocalSearchParams, useRouter } from 'expo-router';

import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { ClaimAthleteContainer, ClaimSignedOutScreen, createPowerSyncAuthorizationRepository } from '../../modules/accounts';
import { createSupabaseAthleteRegistrationRepository } from '../../modules/athletes';

const authorizations = createPowerSyncAuthorizationRepository();
const registrations = createSupabaseAthleteRegistrationRepository();

// swimcro://claim/<token> (the link the school shares for a swimmer it registered): outside both guarded groups, like invite/<token>,
// so it opens signed in or out. Signed out it asks to sign in first; signed in the family reads the authorizations and accepts.
export default function ClaimLink() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useSession();
  // The texts arrive with a sync, so they are read again when one completes.
  const { lastSyncedAt } = useGlobalSyncSummary();
  if (!session) return <ClaimSignedOutScreen onSignIn={() => router.replace('/sign-in')} />;
  return (
    <ClaimAthleteContainer
      token={token}
      repository={registrations}
      authorizations={authorizations}
      refreshKey={lastSyncedAt?.getTime()}
      // The swimmer reaches «Mis deportistas» (the home of the family) with the next sync.
      onDone={() => router.replace('/')}
      onCancel={() => router.replace('/')}
    />
  );
}
