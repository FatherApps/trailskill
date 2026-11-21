import { useLocalSearchParams, useRouter } from 'expo-router';

import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import {
  AthleteAvatarWithPhoto,
  AthleteShareCodeContainer,
  createPowerSyncAuthorizationStatusRepository,
  createPowerSyncManagedAthleteRepository,
  createSupabaseAthleteShareCodeRepository,
  useHasValidAuthorization,
} from '../../../modules/accounts';
import {
  AthletePhotoContainer,
  AthleteProfileContainer,
  createExpoPhotoPicker,
  createPowerSyncAthleteSchoolRepository,
  createPowerSyncHistoryRepository,
  createPowerSyncSchoolAthleteRepository,
  createSupabaseOtherSchoolResultsRepository,
  getAthletePhotoService,
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
const shareCodes = createSupabaseAthleteShareCodeRepository();
const guardianSharing = createSupabaseGuardianSharingRepository();
const guardianRecords = createGuardianRecordsRepository(createPowerSyncMeasurementRepository());
const photoService = getAthletePhotoService();
const photoPicker = createExpoPhotoPicker();

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
  const managed = useManagedAthletes(managedAthletes, athletes, session?.user.id, syncedAt);
  const sources = useImportSources(importSources, summary.connection === 'connected');
  // The athletes module cannot read the authorization (a cycle with accounts), so the route does and passes it down.
  const showPhoto = useHasValidAuthorization(id, 'show_photo');
  // The import button of the official-results update is pinned to the bottom of the screen, outside the list.
  const importFooter = useImportFooterStore();
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
      // Only who manages the swimmer adds, changes or removes the photo (the server refuses a coach). Without show_photo the button opens the authorization first.
      photoCard={
        managedAthlete
          ? (avatar) => (
              <AthletePhotoContainer
                key={`photo-${id}`}
                athleteId={id}
                userId={session.user.id}
                authorized={showPhoto}
                online={summary.connection === 'connected'}
                service={photoService}
                picker={photoPicker}
                avatar={avatar}
                onAuthorize={() => router.push('/authorizations')}
              />
            )
          : undefined
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
