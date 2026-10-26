import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { useSession } from '../../../core/session';
import { createPowerSyncStaffSchoolRepository } from '../../../modules/school-console';
import {
  createPowerSyncTrainingPlanRepository,
  PlanEditorScreen,
  planVocabulary,
} from '../../../modules/training-plans';

const repository = createPowerSyncTrainingPlanRepository();
const schools = createPowerSyncStaffSchoolRepository();

// "new" opens an empty plan; any other id opens that plan.
export default function PlanEditorRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const vocabulary = useMemo(() => planVocabulary(), []);

  if (!session) return null;
  return (
    <PlanEditorScreen
      planId={id === 'new' ? null : id}
      repository={repository}
      schools={schools}
      userId={session.user.id}
      vocabulary={vocabulary}
      onSaved={(planId) => {
        if (id === 'new') router.replace(`/plans/${planId}`);
      }}
    />
  );
}
