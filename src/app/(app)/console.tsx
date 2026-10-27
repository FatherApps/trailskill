import { Redirect, useRouter } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { t } from '../../core/i18n';
import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { useTheme } from '../../core/theme';
import { Button, StateView } from '../../core/ui';
import {
  AthletesSection,
  AuthorizationsSection,
  CategoriesSection,
  CoachesSection,
  ConsoleScreen,
  createPowerSyncAuthorizationsRepository,
  createPowerSyncCoachRepository,
  createPowerSyncCategoryRecordsRepository,
  createPowerSyncConsoleAthletesRepository,
  createPowerSyncMeasurementLogRepository,
  createPowerSyncCategoriesRepository,
  createPowerSyncSchoolStructureRepository,
  createPowerSyncStaffSchoolRepository,
  MeasurementsSection,
  RecordsSection,
  useAdminSchool,
} from '../../modules/school-console';

const staffSchools = createPowerSyncStaffSchoolRepository();
const consoleAthletes = createPowerSyncConsoleAthletesRepository();
const categories = createPowerSyncCategoriesRepository();
const authorizations = createPowerSyncAuthorizationsRepository();
const categoryRecords = createPowerSyncCategoryRecordsRepository();
const measurementLog = createPowerSyncMeasurementLogRepository();
const schoolStructure = createPowerSyncSchoolStructureRepository();
const coaches = createPowerSyncCoachRepository();

// Deactivating a coach waits for issue 220; the button is shown disabled, so this is never called.
const noop = () => {};

export default function ConsoleRoute() {
  const router = useRouter();
  const { session } = useSession();
  const { width } = useWindowDimensions();
  const { colors, space } = useTheme();
  // Memberships arrive with a sync, so the lookup runs again when one completes.
  const { lastSyncedAt, connection } = useGlobalSyncSummary();
  const access = useAdminSchool(staffSchools, session?.user.id, lastSyncedAt?.getTime());

  if (access.status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: space[4], backgroundColor: colors['surface-0'] }}>
        <StateView kind="loading" />
      </View>
    );
  }
  // Only a hidden screen is not protection: the backend enforces the role on every query.
  if (access.status === 'denied') return <Redirect href="/" />;
  // A failed lookup says nothing about the role: it does not leave the console, it offers to look again.
  if (access.status === 'error') {
    return (
      <View testID="access-error" style={{ flex: 1, justifyContent: 'center', padding: space[4], backgroundColor: colors['surface-0'] }}>
        <StateView
          kind="error"
          title={t('schoolConsole.screen.access_error_title')}
          message={t('schoolConsole.screen.access_error_message')}
          action={{ label: t('schoolConsole.screen.retry'), onPress: access.retry }}
        />
        {/* Not a sign out: offline it can leave writes unsynced and force a new login. */}
        <View testID="access-error-home" style={{ alignItems: 'center', marginTop: space[4] }}>
          <Button variant="ghost" label={t('schoolConsole.screen.access_error_home')} onPress={() => router.replace('/')} />
        </View>
      </View>
    );
  }
  const schoolId = access.school.id;
  return (
    <ConsoleScreen
      width={width}
      schoolName={access.school.name}
      onOpenPlans={() => router.push('/plans')}
      sections={{
        coaches: (props) => (
          <CoachesSection {...props} schoolId={schoolId} repository={coaches} structure={schoolStructure} athletes={consoleAthletes} refreshKey={lastSyncedAt?.getTime()} lastSyncedAt={lastSyncedAt} connection={connection} onDeactivate={noop} />
        ),
        athletes: (props) => (
          <AthletesSection {...props} schoolId={schoolId} repository={consoleAthletes} categories={categories} refreshKey={lastSyncedAt?.getTime()} lastSyncedAt={lastSyncedAt} connection={connection} />
        ),
        records: (props) => (
          <RecordsSection {...props} schoolId={schoolId} repository={categoryRecords} categories={categories} structure={schoolStructure} refreshKey={lastSyncedAt?.getTime()} lastSyncedAt={lastSyncedAt} connection={connection} />
        ),
        measurements: (props) => (
          <MeasurementsSection {...props} schoolId={schoolId} repository={measurementLog} categories={categories} refreshKey={lastSyncedAt?.getTime()} lastSyncedAt={lastSyncedAt} connection={connection} />
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
