import { useLocalSearchParams } from 'expo-router';

import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import { createPowerSyncAuthorizationStatusRepository } from '../../../modules/accounts';
import { AthleteProfileContainer, createPowerSyncHistoryRepository, createPowerSyncSchoolAthleteRepository } from '../../../modules/athletes';

const athletes = createPowerSyncSchoolAthleteRepository();
const history = createPowerSyncHistoryRepository();
const authorizations = createPowerSyncAuthorizationStatusRepository();

export default function AthleteProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const lastSyncedAt = useGlobalSyncSummary().lastSyncedAt ?? null;

  if (!session) return null;
  // The container shows "private" for an athlete that is not on this device; the backend decides what reaches it.
  return <AthleteProfileContainer athleteId={id} athletes={athletes} history={history} authorizations={authorizations} lastSyncedAt={lastSyncedAt} />;
}
