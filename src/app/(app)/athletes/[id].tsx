import { useLocalSearchParams, useRouter } from 'expo-router';

import { useGoBack } from '../../../core/navigation';
import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import {
  AthleteShareCodeContainer,
  createPowerSyncAuthorizationStatusRepository,
  createPowerSyncManagedAthleteRepository,
  createSupabaseAthleteShareCodeRepository,
} from '../../../modules/accounts';
import {
  AthleteProfileContainer,
  createPowerSyncAthleteSchoolRepository,
  createPowerSyncHistoryRepository,
  createPowerSyncSchoolAthleteRepository,
  createSupabaseOtherSchoolResultsRepository,
  useAthleteProfileRoute,
  useManagedAthletes,
} from '../../../modules/athletes';
import {
  createIdentityConfirmation,
  createOfficialUpdate,
  createPowerSyncImportedResultsRepository,
  createSupabaseImportSourcesRepository,
  createSupabaseOfficialResultsService,
  createSupabasePendingChangeResolver,
  OfficialUpdateContainer,
  useImportSources,
} from '../../../modules/results-import';
import { createPowerSyncMeasurementRepository } from '../../../modules/timing';
import {
  createGuardianRecordsRepository,
  createPowerSyncSchoolNameRepository,
  createPowerSyncSchoolStructureRepository,
  createPowerSyncStaffSchoolRepository,
  createSupabaseGuardianSharingRepository,
  SwimmerSharingSection,
  useStaffSchool,
} from '../../../modules/school-console';

const athletes = createPowerSyncSchoolAthleteRepository();
const history = createPowerSyncHistoryRepository();
const authorizations = createPowerSyncAuthorizationStatusRepository();
const schoolLinks = createPowerSyncAthleteSchoolRepository();
const schoolNames = createPowerSyncSchoolNameRepository();
const categories = createPowerSyncSchoolStructureRepository();
const staffSchools = createPowerSyncStaffSchoolRepository();
const otherSchoolResults = createSupabaseOtherSchoolResultsRepository();
const importedResults = createPowerSyncImportedResultsRepository();
const officialResults = createSupabaseOfficialResultsService();
const officialUpdate = createOfficialUpdate({ service: officialResults, repository: importedResults });
const identity = createIdentityConfirmation(officialResults);
const changeResolver = createSupabasePendingChangeResolver();
const managedAthletes = createPowerSyncManagedAthleteRepository();
const importSources = createSupabaseImportSourcesRepository();
const shareCodes = createSupabaseAthleteShareCodeRepository();
const guardianSharing = createSupabaseGuardianSharingRepository();
const guardianRecords = createGuardianRecordsRepository(createPowerSyncMeasurementRepository());

export default function AthleteProfileRoute() {
  // `name` is the only thing besides the id the route carries: the band shows it from the first frame.
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { session } = useSession();
  const summary = useGlobalSyncSummary();
  const lastSyncedAt = summary.lastSyncedAt ?? null;
  const syncedAt = lastSyncedAt?.getTime();
  // Only school staff can be entitled to another school's results; the server decides which.
  const staff = useStaffSchool(staffSchools, session?.user.id, syncedAt);
  const managed = useManagedAthletes(managedAthletes, athletes, session?.user.id, syncedAt);
  const sources = useImportSources(importSources, summary.connection === 'connected');
  const { isStaff, sharingSchoolId, sourceNames, sessionDated, managedAthlete, importPrompt } = useAthleteProfileRoute({
    athleteId: id,
    syncedAt,
    importedResults,
    identity,
    schoolLinks,
    staff,
    sources,
    managed,
    onImport: () => router.push(`/athletes/import/${id}`),
    onImportTournament: () => router.push(`/athletes/import-tournament/${id}`),
  });

  if (!session) return null;
  // The container shows "private" for an athlete that is not on this device; the backend decides what reaches it.
  return (
    <AthleteProfileContainer
      athleteId={id}
      name={name}
      athlete={managedAthlete}
      athletes={athletes}
      history={history}
      authorizations={authorizations}
      schoolLinks={schoolLinks}
      schoolNames={schoolNames}
      categories={categories}
      lastSyncedAt={lastSyncedAt}
      otherSchoolResults={isStaff ? otherSchoolResults : undefined}
      importedResults={importedResults}
      sourceNames={sourceNames}
      sessionDated={sessionDated}
      // The server decides who may update: without a confirmed identity and a manager with the authorization in force, nothing shows.
      officialUpdate={
        <OfficialUpdateContainer
          // A new athlete remounts it, so the list, selection and notices of the previous one never show.
          // The slot name keeps the key distinct from its sibling, the share code.
          key={`official-update-${id}`}
          athleteId={id}
          update={officialUpdate}
          repository={importedResults}
          identity={identity}
          authorizations={authorizations}
          resolver={changeResolver}
          syncKey={syncedAt}
        />
      }
      // Only who manages the swimmer: the server refuses the code to anyone else.
      shareCode={
        managedAthlete ? (
          <AthleteShareCodeContainer
            key={`share-code-${id}`}
            athleteId={id}
            athleteName={managedAthlete.firstName}
            repository={shareCodes}
            online={summary.connection === 'connected'}
          />
        ) : undefined
      }
      // Staff of the swimmer's school choose what the guardian sees; the server refuses anyone else.
      guardianSharing={
        sharingSchoolId ? (
          <SwimmerSharingSection
            key={`guardian-sharing-${id}-${sharingSchoolId}`}
            repository={guardianSharing}
            records={guardianRecords}
            athleteId={id}
            schoolId={sharingSchoolId}
            connection={summary.connection}
            refreshKey={syncedAt}
          />
        ) : undefined
      }
      online={summary.connection === 'connected'}
      // Records waiting to be sent or that failed to send: with none, connected, the sync tag says "Al día".
      pendingChanges={summary.pending + summary.failed}
      importPrompt={importPrompt}
      onBack={goBack}
    />
  );
}
