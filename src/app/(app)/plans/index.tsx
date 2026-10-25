import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useSession } from '../../../core/session';
import { createPowerSyncStaffSchoolRepository } from '../../../modules/school-console';
import { createPowerSyncTrainingPlanRepository, PlansScreen } from '../../../modules/training-plans';

const repository = createPowerSyncTrainingPlanRepository();
const schools = createPowerSyncStaffSchoolRepository();

export default function PlansRoute() {
  const { session } = useSession();
  const [refreshKey, setRefreshKey] = useState(0);
  // Coming back from the editor reloads the list, so new and renamed plans show.
  useFocusEffect(useCallback(() => setRefreshKey((n) => n + 1), []));

  if (!session) return null;
  return (
    <PlansScreen
      repository={repository}
      schools={schools}
      userId={session.user.id}
      refreshKey={refreshKey}
      onOpenPlan={(id) => router.push(`/plans/${id}`)}
      onNewPlan={() => router.push('/plans/new')}
      onAssign={() => router.push('/plans/assign')}
    />
  );
}
