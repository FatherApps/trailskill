import { useLocalSearchParams, useRouter } from 'expo-router';

import { useGoBack } from '../../core/navigation';
import { useSession } from '../../core/session';
import { RecordSyncStatus, useGlobalSyncSummary } from '../../core/sync';
import { createPowerSyncManagedAthleteRepository } from '../../modules/accounts';
import { createPowerSyncAthleteSchoolRepository, createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../modules/athletes';
import { createPowerSyncStaffSchoolRepository, useStaffSchool } from '../../modules/school-console';
import { createPowerSyncSeriesRepository } from '../../modules/timing';
import {
  createPowerSyncAssignmentRepository,
  createPowerSyncFulfillmentRepository,
  createPowerSyncNoticeRepository,
  createPowerSyncTrainingPlanRepository,
  TodayContainer,
} from '../../modules/training-plans';

const staffSchools = createPowerSyncStaffSchoolRepository();
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
  const router = useRouter();
  // The plan of the day has no bar: it opens from "Lo próximo" on Inicio and goes back to it.
  const goBack = useGoBack('/home');
  const { session } = useSession();
  const summary = useGlobalSyncSummary();
  // Managed athletes arrive with a sync, so the lookup runs again when one completes.
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, session?.user.id, summary.lastSyncedAt?.getTime());

  // "Mis deportistas" is a destination of guardians and adult athletes only; school staff (admin or coach) navigate elsewhere, whatever the screen size.
  // When the lookup fails the role is unknown: "Hoy" shows its error view with a retry instead of an action that may not be for this person.
  const staff = useStaffSchool(staffSchools, session?.user.id, summary.lastSyncedAt?.getTime());

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
      synced={summary.lastSyncedAt != null}
      offline={summary.connection === 'offline'}
      actionPending={staff.status === 'loading'}
      onOpenAthletes={staff.status === 'denied' ? () => router.push('/athletes') : undefined}
      onRetryAction={staff.status === 'error' ? staff.retry : undefined}
      onBack={goBack}
      renderNoticeStatus={(id) => <RecordSyncStatus table="training_plan_notices" id={id} />}
    />
  );
}
