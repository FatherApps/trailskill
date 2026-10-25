import { useLocalSearchParams } from 'expo-router';

import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import { createPowerSyncAuthorizationStatusRepository } from '../../../modules/accounts';
import {
  AthleteProfileContainer,
  createPowerSyncAthleteSchoolRepository,
  createPowerSyncHistoryRepository,
  createPowerSyncSchoolAthleteRepository,
} from '../../../modules/athletes';
import { createPowerSyncSchoolNameRepository, createPowerSyncSchoolStructureRepository } from '../../../modules/school-console';

const athletes = createPowerSyncSchoolAthleteRepository();
const history = createPowerSyncHistoryRepository();
const authorizations = createPowerSyncAuthorizationStatusRepository();
const schoolLinks = createPowerSyncAthleteSchoolRepository();
const schoolNames = createPowerSyncSchoolNameRepository();
const categories = createPowerSyncSchoolStructureRepository();

export default function AthleteProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const lastSyncedAt = useGlobalSyncSummary().lastSyncedAt ?? null;

  if (!session) return null;
  // The container shows "private" for an athlete that is not on this device; the backend decides what reaches it.
  return (
    <AthleteProfileContainer
      athleteId={id}
      athletes={athletes}
      history={history}
      authorizations={authorizations}
      schoolLinks={schoolLinks}
      schoolNames={schoolNames}
      categories={categories}
      lastSyncedAt={lastSyncedAt}
    />
  );
}
