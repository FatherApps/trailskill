import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { createPowerSyncManagedAthleteRepository } from '../../modules/accounts';
import { createPowerSyncHistoryRepository, createPowerSyncSchoolAthleteRepository, MarksContainer } from '../../modules/athletes';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const history = createPowerSyncHistoryRepository();

// "/marks": "Marcas", the personal bests of the athletes the person manages.
export default function MarksRoute() {
  const { session } = useSession();
  const { lastSyncedAt } = useGlobalSyncSummary();

  // Managed athletes arrive with a sync, so the lookup runs again when one completes.
  return (
    <MarksContainer
      userId={session?.user.id}
      managed={managedAthletes}
      athletes={schoolAthletes}
      history={history}
      refreshKey={lastSyncedAt?.getTime()}
    />
  );
}
