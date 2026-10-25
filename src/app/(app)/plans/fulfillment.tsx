import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useSession } from '../../../core/session';
import { db } from '../../../core/sync';
import { createPowerSyncAuthorizationStatusRepository } from '../../../modules/accounts';
import { createPowerSyncSchoolAthleteRepository } from '../../../modules/athletes';
import { createPowerSyncSchoolStructureRepository, createPowerSyncStaffSchoolRepository } from '../../../modules/school-console';
import { createPowerSyncSeriesRepository } from '../../../modules/timing';
import {
  createPowerSyncAssignmentRepository,
  createPowerSyncFulfillmentRepository,
  createPowerSyncTrainingPlanRepository,
  FulfillmentContainer,
} from '../../../modules/training-plans';

const plans = createPowerSyncTrainingPlanRepository();
const assignments = createPowerSyncAssignmentRepository();
const athletes = createPowerSyncSchoolAthleteRepository();
const structure = createPowerSyncSchoolStructureRepository();
const schools = createPowerSyncStaffSchoolRepository();
const fulfillment = createPowerSyncFulfillmentRepository();
const authorizations = createPowerSyncAuthorizationStatusRepository();
const series = createPowerSyncSeriesRepository();

// "/plans/fulfillment?assignment=<id>&day=YYYY-MM-DD": the grid of one assignment, reached from the assigned plans of the day.
export default function FulfillmentRoute() {
  const { assignment, day } = useLocalSearchParams<{ assignment?: string; day?: string }>();
  const { session } = useSession();
  const [deviceId, setDeviceId] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    db.getClientId()
      .then(setDeviceId)
      .catch(() => {});
  }, []);
  // Coming back from the timing reloads the grid, so the times recorded show.
  useFocusEffect(useCallback(() => setRefreshKey((n) => n + 1), []));

  if (!session || !deviceId || !assignment || !day) return null;
  return (
    <FulfillmentContainer
      plans={plans}
      assignments={assignments}
      athletes={athletes}
      structure={structure}
      schools={schools}
      fulfillment={fulfillment}
      authorizations={authorizations}
      series={series}
      userId={session.user.id}
      deviceId={deviceId}
      assignmentId={assignment}
      day={day}
      refreshKey={refreshKey}
      onOpenTiming={() => router.push('/timing?mode=series')}
    />
  );
}
