import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useGoBack } from '../../../core/navigation';
import { useSession } from '../../../core/session';
import { useGlobalSyncSummary } from '../../../core/sync';
import { createPowerSyncAuthorizationStatusRepository, createPowerSyncManagedAthleteRepository } from '../../../modules/accounts';
import {
  AthleteProfileContainer,
  createPowerSyncAthleteSchoolRepository,
  createPowerSyncHistoryRepository,
  createPowerSyncSchoolAthleteRepository,
  createSupabaseOtherSchoolResultsRepository,
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
import {
  createPowerSyncSchoolNameRepository,
  createPowerSyncSchoolStructureRepository,
  createPowerSyncStaffSchoolRepository,
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

export default function AthleteProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { session } = useSession();
  const summary = useGlobalSyncSummary();
  const [importDismissed, setImportDismissed] = useState(false);
  const lastSyncedAt = summary.lastSyncedAt ?? null;
  const syncedAt = lastSyncedAt?.getTime();
  // Once something was imported the invitation is over: updating is the panel's button, so the prompt never shows "refresh".
  const [alreadyImported, setAlreadyImported] = useState(false);
  useEffect(() => {
    let active = true;
    importedResults.lastImportedAt(id).then(
      (at) => active && setAlreadyImported(at !== null),
      () => active && setAlreadyImported(false),
    );
    return () => {
      active = false;
    };
  }, [id, syncedAt]);
  // Only school staff can be entitled to another school's results; the server decides which.
  const isStaff = useStaffSchool(staffSchools, session?.user.id, summary.lastSyncedAt?.getTime()).status === 'staff';

  const managed = useManagedAthletes(managedAthletes, athletes, session?.user.id, summary.lastSyncedAt?.getTime());
  const sources = useImportSources(importSources, summary.connection === 'connected');

  if (!session) return null;
  // Only a guardian or an adult athlete is offered the import; the source's name comes from data.
  const managedAthlete = managed.status === 'ready' ? managed.athletes.find((candidate) => candidate.id === id) : undefined;
  const importPrompt =
    managedAthlete && sources[0] && !importDismissed && !alreadyImported
      ? {
          sourceName: sources[0].name,
          athleteName: managedAthlete.firstName,
          imported: false,
          onDismiss: () => setImportDismissed(true),
          // Never shown while `imported` is false; the update lives in the results panel.
          onRefresh: () => undefined,
          onStart: () => router.push(`/athletes/import/${id}`),
        }
      : undefined;
  // The container shows "private" for an athlete that is not on this device; the backend decides what reaches it.
  return (
    <AthleteProfileContainer
      athleteId={id}
      athletes={athletes}
      history={history}
      authorizations={authorizations}
      schoolLinks={schoolLinks}
      schoolNames={schoolNames}
      categories={categories}
      lastSyncedAt={lastSyncedAt}
      otherSchoolResults={isStaff ? otherSchoolResults : undefined}
      importedResults={importedResults}
      // The server decides who may update: without a confirmed identity and a manager with the authorization in force, nothing shows.
      officialUpdate={
        <OfficialUpdateContainer
          athleteId={id}
          update={officialUpdate}
          repository={importedResults}
          identity={identity}
          authorizations={authorizations}
          resolver={changeResolver}
          syncKey={syncedAt}
        />
      }
      online={summary.connection === 'connected'}
      importPrompt={importPrompt}
      onBack={goBack}
    />
  );
}
