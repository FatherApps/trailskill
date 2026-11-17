import { Redirect, useLocalSearchParams } from 'expo-router';

import { SchoolTimingContainer } from '../../modules/school-console';

// "/timing" times one athlete at a time; "/timing?mode=series" times a group that starts together;
// "/timing?mode=completed" records that the work was done, without a time.
export default function TimingRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <SchoolTimingContainer mode={mode} denied={<Redirect href="/" />} />;
}
