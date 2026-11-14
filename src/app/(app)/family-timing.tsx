import { useMemo } from 'react';

import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { useGoBack } from '../../core/navigation';
import { createPowerSyncManagedAthleteRepository } from '../../modules/accounts';
import { createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../modules/athletes';
import { createPowerSyncFamilyMeasurementRepository, FamilyTimingContainer } from '../../modules/family-timing';
import { createPowerSyncImportedResultsRepository, createSupabaseImportSourcesRepository, useImportSources } from '../../modules/results-import';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const familyMeasurements = createPowerSyncFamilyMeasurementRepository();
const importedResults = createPowerSyncImportedResultsRepository();
const importSources = createSupabaseImportSourcesRepository();

// "/family-timing": "Mis tiempos", the times a guardian or adult athlete measures on their own phone.
export default function FamilyTimingRoute() {
  const goBack = useGoBack('/home');
  const { session } = useSession();
  const { lastSyncedAt, connection } = useGlobalSyncSummary();
  // The organization behind each imported result, from data; without a connection the tag says "Oficial importado".
  const sources = useImportSources(importSources, connection === 'connected');
  const sourceNames = useMemo(() => Object.fromEntries(sources.map((source) => [source.provider, source.name])), [sources]);
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, session?.user.id, lastSyncedAt?.getTime());
  if (!session || managed.status !== 'ready') return null;
  return (
    <FamilyTimingContainer
      userId={session.user.id}
      athletes={managed.athletes}
      repository={familyMeasurements}
      imports={importedResults}
      sourceNames={sourceNames}
      onBack={goBack}
    />
  );
}
