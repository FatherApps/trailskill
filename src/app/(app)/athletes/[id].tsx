import { useLocalSearchParams, useRouter } from 'expo-router';

import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import {
  AthleteAvatarWithPhoto,
  createPowerSyncAuthorizationStatusRepository,
  createPowerSyncManagedAthleteRepository,
} from '../../../modules/accounts';
import {
  AthleteProfileContainer,
  AthleteRecoveryCodeContainer,
  createSecureStoreRecoveryCodeVault,
  createSupabaseAthleteRecoveryCodeRepository,
  createPowerSyncAthleteSchoolRepository,
  createPowerSyncHistoryRepository,
  createPowerSyncSchoolAthleteRepository,
  createSupabaseOtherSchoolResultsRepository,
  useAthleteNamesVersion,
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
  ImportFooterSlot,
  OfficialUpdateContainer,
  useImportFooterStore,
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
const guardianSharing = createSupabaseGuardianSharingRepository();
const recoveryCodes = createSupabaseAthleteRecoveryCodeRepository();
const recoveryCodeVault = createSecureStoreRecoveryCodeVault();
const guardianRecords = createGuardianRecordsRepository(createPowerSyncMeasurementRepository());

export default function AthleteProfileRoute() {
  // `name` is the only thing besides the id the route carries: the band shows it from the first frame.
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const { session } = useSession();
  const summary = useGlobalSyncSummary();
  const lastSyncedAt = summary.lastSyncedAt ?? null;
  const syncedAt = lastSyncedAt?.getTime();
  // Only school staff can be entitled to another school's results; the server decides which.
  const staff = useStaffSchool(staffSchools, session?.user.id, syncedAt);
  // A rename saved on the Editar screen is a local write: the version makes the name here read it right away.
  const namesVersion = useAthleteNamesVersion();
  const managed = useManagedAthletes(managedAthletes, athletes, session?.user.id, `${syncedAt}:${namesVersion}`);
  const sources = useImportSources(importSources, summary.connection === 'connected');
  // The import button of the official-results update is pinned to the bottom of the screen, outside the list.
  const importFooter = useImportFooterStore();
  const { isStaff, sharingSchoolId, sourceNames, sessionDated, federation, managedAthlete, importPrompt } = useAthleteProfileRoute({
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
      Avatar={AthleteAvatarWithPhoto}
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
      federation={federation}
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
          footerStore={importFooter}
        />
      }
      bottomBar={<ImportFooterSlot store={importFooter} />}
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
      // Only who manages the swimmer (the owner) gets the row: never school staff or another family.
      recoveryCode={
        managedAthlete ? (
          <AthleteRecoveryCodeContainer
            key={`recovery-code-${id}`}
            athleteId={id}
            athleteName={managedAthlete.firstName}
            userId={session.user.id}
            repository={recoveryCodes}
            vault={recoveryCodeVault}
            online={summary.connection === 'connected'}
          />
        ) : undefined
      }
      online={summary.connection === 'connected'}
      // Records waiting to be sent or that failed to send: with none, connected, the sync tag says "Al día".
      pendingChanges={summary.pending + summary.failed}
      importPrompt={importPrompt}
      // Without history (the landing sent a one-athlete guardian here) there is nowhere to go back to, so no back button.
      onBack={router.canGoBack() ? () => router.back() : undefined}
    />
  );
}
