import { Stack, useRouter } from 'expo-router';

import { useSession } from '../../../core/session';
import { ConsoleFrame, createPowerSyncStaffSchoolRepository } from '../../../modules/school-console';

const schools = createPowerSyncStaffSchoolRepository();

// The plan routes live outside the console sections, so an admin on a tablet gets the console navigation around them, with "Planes" active.
export default function PlansLayout() {
  const router = useRouter();
  const { session } = useSession();
  return (
    <ConsoleFrame
      schools={schools}
      userId={session?.user.id}
      activeId="plans"
      // `at` makes the console open the section even when the same one is already in its URL.
      onNavigate={(id) =>
        id === 'plans' ? router.navigate('/plans') : router.dismissTo({ pathname: '/console', params: { section: id, at: String(Date.now()) } })
      }
    >
      <Stack screenOptions={{ headerShown: false }} />
    </ConsoleFrame>
  );
}
