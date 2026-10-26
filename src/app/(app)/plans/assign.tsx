import { useRouter } from 'expo-router';

import { useSession } from '../../../core/session';
import { createPowerSyncSchoolAthleteRepository } from '../../../modules/athletes';
import { createPowerSyncSchoolStructureRepository, createPowerSyncStaffSchoolRepository } from '../../../modules/school-console';
import {
  AssignPlanContainer,
  createPowerSyncAssignmentRepository,
  createPowerSyncTrainingPlanRepository,
} from '../../../modules/training-plans';

const plans = createPowerSyncTrainingPlanRepository();
const assignments = createPowerSyncAssignmentRepository();
const athletes = createPowerSyncSchoolAthleteRepository();
const structure = createPowerSyncSchoolStructureRepository();
const schools = createPowerSyncStaffSchoolRepository();

export default function AssignPlanRoute() {
  const router = useRouter();
  const { session } = useSession();
  if (!session) return null;
  return (
    <AssignPlanContainer
      plans={plans}
      assignments={assignments}
      athletes={athletes}
      structure={structure}
      schools={schools}
      userId={session.user.id}
      onOpenFulfillment={(id, day) => router.push({ pathname: '/plans/fulfillment', params: { assignment: id, day } })}
    />
  );
}
