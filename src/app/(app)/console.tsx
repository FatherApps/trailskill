import { Redirect } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import {
  AthletesSection,
  AuthorizationsSection,
  CategoriesSection,
  CoachesScreen,
  ConsoleScreen,
  createPowerSyncAuthorizationsRepository,
  createPowerSyncConsoleAthletesRepository,
  createPowerSyncCategoriesRepository,
  createPowerSyncStaffSchoolRepository,
  MeasurementsScreen,
  RecordsScreen,
  useAdminSchool,
  type ConsoleScreenProps,
} from '../../modules/school-console';

const staffSchools = createPowerSyncStaffSchoolRepository();
const consoleAthletes = createPowerSyncConsoleAthletesRepository();
const categories = createPowerSyncCategoriesRepository();
const authorizations = createPowerSyncAuthorizationsRepository();

const noop = () => {};

// The sections whose data is not connected yet (tasks 5.3 to 5.5): each shows its empty state and its events do nothing.
const sections: ConsoleScreenProps['sections'] = {
  coaches: (props) => <CoachesScreen {...props} view={{ kind: 'empty' }} onInvite={noop} onDeactivate={noop} />,
  records: (props) => <RecordsScreen {...props} view={{ kind: 'empty' }} onCategoryPress={noop} onPoolChange={noop} />,
  measurements: (props) => (
    <MeasurementsScreen {...props} view={{ kind: 'empty' }} onQueryChange={noop} onFilterPress={noop} />
  ),
};

export default function ConsoleRoute() {
  const { session } = useSession();
  const { width } = useWindowDimensions();
  // Memberships arrive with a sync, so the lookup runs again when one completes.
  const { lastSyncedAt, connection } = useGlobalSyncSummary();
  const access = useAdminSchool(staffSchools, session?.user.id, lastSyncedAt?.getTime());

  if (access.status === 'loading') return null;
  // Only a hidden screen is not protection: the backend enforces the role on every query.
  if (access.status === 'denied') return <Redirect href="/" />;
  const schoolId = access.school.id;
  return (
    <ConsoleScreen
      width={width}
      schoolName={access.school.name}
      sections={{
        ...sections,
        athletes: (props) => (
          <AthletesSection {...props} schoolId={schoolId} repository={consoleAthletes} categories={categories} refreshKey={lastSyncedAt?.getTime()} lastSyncedAt={lastSyncedAt} connection={connection} />
        ),
        authorizations: (props) => (
          <AuthorizationsSection {...props} schoolId={schoolId} repository={authorizations} refreshKey={lastSyncedAt?.getTime()} lastSyncedAt={lastSyncedAt} connection={connection} />
        ),
        settings: (props) => (
          <CategoriesSection {...props} repository={categories} schoolId={schoolId} refreshKey={lastSyncedAt?.getTime()} />
        ),
      }}
    />
  );
}
