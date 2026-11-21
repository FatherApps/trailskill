import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

import { AthleteAvatarWithPhoto } from '../../../modules/accounts';
import { FulfillmentFlow } from '../../../modules/training-plans';

// "/plans/fulfillment?assignment=<id>&day=YYYY-MM-DD": the grid of one assignment, reached from the assigned plans of the day.
export default function FulfillmentRoute() {
  const router = useRouter();
  const { assignment, day } = useLocalSearchParams<{ assignment?: string; day?: string }>();
  const [refreshKey, setRefreshKey] = useState(0);
  // Coming back from the timing reloads the grid, so the times recorded show.
  useFocusEffect(useCallback(() => setRefreshKey((n) => n + 1), []));

  return (
    <FulfillmentFlow
      Avatar={AthleteAvatarWithPhoto}
      assignmentId={assignment}
      day={day}
      refreshKey={refreshKey}
      onOpenTiming={() => router.push('/timing?mode=series')}
      // Without history (a deep link) there is nowhere to go back to, so no back button.
      onBack={router.canGoBack() ? () => router.back() : undefined}
    />
  );
}
