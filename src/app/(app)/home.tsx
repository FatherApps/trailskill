import { useRouter } from 'expo-router';

import { useSession } from '../../core/session';
import { recordSyncState, useGlobalSyncSummary } from '../../core/sync';
import { createPowerSyncManagedAthleteRepository, createPowerSyncOwnAuthorizationEvidence, providerAccountOf, useOwnLandingEvidence } from '../../modules/accounts';
import {
  createPowerSyncAthleteSchoolRepository,
  createPowerSyncHistoryRepository,
  createPowerSyncSchoolAthleteRepository,
  useManagedAthletes,
} from '../../modules/athletes';
import { createPowerSyncSchoolNameRepository } from '../../modules/school-console';
import { createPowerSyncAssignmentRepository, createPowerSyncTrainingPlanRepository, HomeContainer } from '../../modules/training-plans';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const schoolLinks = createPowerSyncAthleteSchoolRepository();
const hasOwnAuthorizations = createPowerSyncOwnAuthorizationEvidence();
const schoolNames = createPowerSyncSchoolNameRepository();
const plans = createPowerSyncTrainingPlanRepository();
const assignments = createPowerSyncAssignmentRepository();
const history = createPowerSyncHistoryRepository();

// "/home": "Inicio", the family's start screen. "/" stays the landing of every role.
export default function HomeRoute() {
  const router = useRouter();
  const { session } = useSession();
  const summary = useGlobalSyncSummary();
  const lastSyncedAt = summary.lastSyncedAt?.getTime();
  // Managed athletes arrive with a sync, so the lookup runs again when one completes.
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, session?.user.id, lastSyncedAt);
  const own = useOwnLandingEvidence(managedAthletes, hasOwnAuthorizations, session?.user.id, lastSyncedAt);

  if (!session || managed.status !== 'ready') return null;
  // An adult athlete is greeted by the name of their own athlete; a guardian by the name their sign-in provider gave, if any.
  const self = own !== 'loading' && own.selfAthleteId ? managed.athletes.find((a) => a.id === own.selfAthleteId)?.firstName : undefined;
  return (
    <HomeContainer
      plans={plans}
      assignments={assignments}
      schoolLinks={schoolLinks}
      history={history}
      schoolNames={schoolNames}
      athletes={managed.athletes}
      greetingName={self?.trim() || providerAccountOf(session.user).firstName}
      syncState={recordSyncState({ pending: summary.pending > 0, failed: summary.failed > 0, uploading: summary.uploading })}
      synced={summary.lastSyncedAt != null}
      onOpenToday={(athleteId) => router.push(`/today?athlete=${athleteId}`)}
    />
  );
}
