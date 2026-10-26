import { useLocalSearchParams } from 'expo-router';

import { useGoBack } from '../../../core/navigation';
import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import { createPowerSyncAuthorizationStatusRepository } from '../../../modules/accounts';
import {
  AthleteProfileContainer,
  createPowerSyncAthleteSchoolRepository,
  createPowerSyncHistoryRepository,
  createPowerSyncSchoolAthleteRepository,
  createSupabaseOtherSchoolResultsRepository,
} from '../../../modules/athletes';
import {
  createPowerSyncSchoolNameRepository,
  createPowerSyncSchoolStructureRepository,
  createPowerSyncStaffSchoolRepository,
  useStaffSchool,
} from '../../../modules/school-console';

const athletes = createPowerSyncSchoolAthleteRepository();
const history = createPowerSyncHistoryRepository();
const authorizations = createPowerSyncAuthorizationStatusRepository();
const schoolLinks = createPowerSyncAthleteSchoolRepository();
const schoolNames = createPowerSyncSchoolNameRepository();
const categories = createPowerSyncSchoolStructureRepository();
const staffSchools = createPowerSyncStaffSchoolRepository();
const otherSchoolResults = createSupabaseOtherSchoolResultsRepository();

export default function AthleteProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useGoBack();
  const { session } = useSession();
  const summary = useGlobalSyncSummary();
  const lastSyncedAt = summary.lastSyncedAt ?? null;
  // Only school staff can be entitled to another school's results; the server decides which.
  const isStaff = useStaffSchool(staffSchools, session?.user.id, summary.lastSyncedAt?.getTime()).status === 'staff';

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
      otherSchoolResults={isStaff ? otherSchoolResults : undefined}
      online={summary.connection === 'connected'}
      // Deep links and cold starts leave no screen to go back to.
      onBack={goBack}
    />
  );
}
