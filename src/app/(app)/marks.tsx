import { useMemo } from 'react';

import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { createPowerSyncManagedAthleteRepository } from '../../modules/accounts';
import { createPowerSyncHistoryRepository, createPowerSyncSchoolAthleteRepository, MarksContainer } from '../../modules/athletes';
import { createPowerSyncImportedResultsRepository, createSupabaseImportSourcesRepository, useImportSources } from '../../modules/results-import';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const history = createPowerSyncHistoryRepository();
const importedResults = createPowerSyncImportedResultsRepository();
const importSources = createSupabaseImportSourcesRepository();

// "/marks": "Marcas", the personal bests of the athletes the person manages.
export default function MarksRoute() {
  const { session } = useSession();
  const { lastSyncedAt, connection } = useGlobalSyncSummary();
  // The organization behind each imported result, from data; without a connection the marks show the generic origin.
  const sources = useImportSources(importSources, connection === 'connected');
  const sourceNames = useMemo(() => Object.fromEntries(sources.map((source) => [source.provider, source.name])), [sources]);
  // A results platform dates each result by its session: that date wins when two sources hold the same swim.
  const sessionDated = useMemo(() => sources.filter((source) => source.kind === 'platform').map((source) => source.provider), [sources]);

  // Managed athletes arrive with a sync, so the lookup runs again when one completes.
  return (
    <MarksContainer
      userId={session?.user.id}
      managed={managedAthletes}
      athletes={schoolAthletes}
      history={history}
      importedResults={importedResults}
      sourceNames={sourceNames}
      sessionDated={sessionDated}
      refreshKey={lastSyncedAt?.getTime()}
    />
  );
}
