import { useMemo } from 'react';

import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { useGoBack } from '../../core/navigation';
import { createPowerSyncManagedAthleteRepository, createSupabaseAthleteShareCodeRepository } from '../../modules/accounts';
import { createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../modules/athletes';
import {
  createPowerSyncFamilyMeasurementRepository,
  createPowerSyncFamilyTransferRepository,
  createSecureStoreFamilyTimingNoticeStore,
  videoCamera,
  FamilyTimingContainer,
} from '../../modules/family-timing';
import { createPowerSyncImportedResultsRepository, createSupabaseImportSourcesRepository, useImportSources } from '../../modules/results-import';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const familyMeasurements = createPowerSyncFamilyMeasurementRepository();
const familyTransfers = createPowerSyncFamilyTransferRepository();
const shareCodes = createSupabaseAthleteShareCodeRepository();
const importedResults = createPowerSyncImportedResultsRepository();
const importSources = createSupabaseImportSourcesRepository();
const notice = createSecureStoreFamilyTimingNoticeStore();

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
      transfers={familyTransfers}
      shareCodes={shareCodes}
      notice={notice}
      videoCamera={videoCamera}
      // Requests and times moved by another family arrive by sync.
      syncKey={lastSyncedAt?.getTime()}
      onBack={goBack}
    />
  );
}
