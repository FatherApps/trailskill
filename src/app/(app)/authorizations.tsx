import { useRouter } from 'expo-router';

import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import {
  AuthorizationsContainer,
  createPowerSyncAuthorizationRepository,
  createPowerSyncManagedAthleteRepository,
} from '../../modules/accounts';
import { athleteDisplay, createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../modules/athletes';

const authorizations = createPowerSyncAuthorizationRepository();
const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();

// Management: accept more purposes or withdraw one, for each athlete the person manages.
export default function Authorizations() {
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
      athletes={managed.athletes.map((athlete) => ({ id: athlete.id, name: athleteDisplay(athlete).shortName }))}
      mode="manage"
      onDone={() => router.back()}
    />
  );
}
