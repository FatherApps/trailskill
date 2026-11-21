import { useMemo } from 'react';

import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { useGoBack } from '../../core/navigation';
import {
  AthleteAvatarWithPhoto,
  createPowerSyncManagedAthleteRepository,
  createPowerSyncSavedShareCodeRepository,
  createSupabaseAthleteShareCodeRepository,
} from '../../modules/accounts';
import { createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../modules/athletes';
import {
  createPowerSyncFamilyMeasurementRepository,
  createPowerSyncFamilyTransferRepository,
  createPowerSyncFamilyVideoRepository,
  createSecureStoreFamilyTimingNoticeStore,
  qrScanner,
  videoCamera,
  videoLibrary,
  videoSharing,
  FamilyTimingContainer,
} from '../../modules/family-timing';
import { createPowerSyncImportedResultsRepository, createSupabaseImportSourcesRepository, useImportSources } from '../../modules/results-import';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const familyMeasurements = createPowerSyncFamilyMeasurementRepository();
const familyTransfers = createPowerSyncFamilyTransferRepository();
const shareCodes = createSupabaseAthleteShareCodeRepository();
const savedShareCodes = createPowerSyncSavedShareCodeRepository();
const importedResults = createPowerSyncImportedResultsRepository();
const importSources = createSupabaseImportSourcesRepository();
const notice = createSecureStoreFamilyTimingNoticeStore();
const videoIntro = createSecureStoreFamilyTimingNoticeStore('video-intro');
const scanIntro = createSecureStoreFamilyTimingNoticeStore('qr-intro');
const familyVideos = createPowerSyncFamilyVideoRepository();

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
      Avatar={AthleteAvatarWithPhoto}
      userId={session.user.id}
      athletes={managed.athletes}
      repository={familyMeasurements}
      imports={importedResults}
      sourceNames={sourceNames}
      transfers={familyTransfers}
      shareCodes={shareCodes}
      savedCodes={savedShareCodes}
      notice={notice}
      videoIntro={videoIntro}
      qrScanner={qrScanner}
      scanIntro={scanIntro}
      videoCamera={videoCamera}
      videos={familyVideos}
      videoLibrary={videoLibrary}
      videoSharing={videoSharing}
      // Requests and times moved by another family arrive by sync.
      syncKey={lastSyncedAt?.getTime()}
      onBack={goBack}
    />
  );
}
