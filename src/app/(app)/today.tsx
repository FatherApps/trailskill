import { useLocalSearchParams } from 'expo-router';

import { useSession } from '../../core/session';
import { RecordSyncStatus, useGlobalSyncSummary } from '../../core/sync';
import { createPowerSyncManagedAthleteRepository } from '../../modules/accounts';
import { createPowerSyncAthleteSchoolRepository, createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../modules/athletes';
import { createPowerSyncSeriesRepository } from '../../modules/timing';
import {
  createPowerSyncAssignmentRepository,
  createPowerSyncFulfillmentRepository,
  createPowerSyncNoticeRepository,
  createPowerSyncTrainingPlanRepository,
  TodayContainer,
} from '../../modules/training-plans';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const schoolLinks = createPowerSyncAthleteSchoolRepository();
const plans = createPowerSyncTrainingPlanRepository();
const assignments = createPowerSyncAssignmentRepository();
const fulfillment = createPowerSyncFulfillmentRepository();
const notices = createPowerSyncNoticeRepository();
const series = createPowerSyncSeriesRepository();

// "/today?athlete=<id>": today's plan of a managed athlete; the athlete picker shows when the user manages several.
export default function TodayRoute() {
  const { athlete } = useLocalSearchParams<{ athlete?: string }>();
  const { session } = useSession();
  const summary = useGlobalSyncSummary();
  // Managed athletes arrive with a sync, so the lookup runs again when one completes.
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, session?.user.id, summary.lastSyncedAt?.getTime());

  if (!session || managed.status !== 'ready') return null;
  return (
    <TodayContainer
      plans={plans}
      assignments={assignments}
      schoolLinks={schoolLinks}
      fulfillment={fulfillment}
      notices={notices}
      series={series}
      userId={session.user.id}
      athletes={managed.athletes}
      initialAthleteId={athlete}
      renderNoticeStatus={(id) => <RecordSyncStatus table="training_plan_notices" id={id} />}
    />
  );
}
