import { Redirect } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import {
  CategoriesSection,
  ConsoleScreen,
  createPowerSyncCategoriesRepository,
  createPowerSyncStaffSchoolRepository,
  useAdminSchool,
} from '../../modules/school-console';

const staffSchools = createPowerSyncStaffSchoolRepository();
const categories = createPowerSyncCategoriesRepository();

export default function ConsoleRoute() {
  const { session } = useSession();
  const { width } = useWindowDimensions();
  // Memberships arrive with a sync, so the lookup runs again when one completes.
  const lastSyncedAt = useGlobalSyncSummary().lastSyncedAt?.getTime();
  const access = useAdminSchool(staffSchools, session?.user.id, lastSyncedAt);

  if (access.status === 'loading') return null;
  // Only a hidden screen is not protection: the backend enforces the role on every query.
  if (access.status === 'denied') return <Redirect href="/" />;
  return (
    <ConsoleScreen
      width={width}
      schoolName={access.school.name}
      sections={{
        settings: (props) => (
          <CategoriesSection {...props} repository={categories} schoolId={access.school.id} refreshKey={lastSyncedAt} />
        ),
      }}
    />
  );
}
