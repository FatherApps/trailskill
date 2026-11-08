import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { useGoBack } from '../../core/navigation';
import { createPowerSyncManagedAthleteRepository } from '../../modules/accounts';
import { createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../modules/athletes';
import { createPowerSyncFamilyMeasurementRepository, FamilyTimingContainer } from '../../modules/family-timing';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const familyMeasurements = createPowerSyncFamilyMeasurementRepository();

// "/family-timing": "Mis tiempos", the times a guardian or adult athlete measures on their own phone.
export default function FamilyTimingRoute() {
  const goBack = useGoBack('/home');
  const { session } = useSession();
  const { lastSyncedAt } = useGlobalSyncSummary();
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, session?.user.id, lastSyncedAt?.getTime());
  if (!session || managed.status !== 'ready') return null;
  return <FamilyTimingContainer userId={session.user.id} athletes={managed.athletes} repository={familyMeasurements} onBack={goBack} />;
}
