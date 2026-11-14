import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

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
  // `name` is the only thing besides the id the route carries: the band shows it from the first frame.
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { session } = useSession();
  const summary = useGlobalSyncSummary();
  const [importDismissed, setImportDismissed] = useState(false);
  const lastSyncedAt = summary.lastSyncedAt ?? null;
  const syncedAt = lastSyncedAt?.getTime();
  // The invitation is only for a guardian who has not started: once the identity is confirmed or something was imported, the
  // results panel takes over (updating is its button), even before the first import.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([importedResults.lastImportedAt(id).catch(() => null), identity.isConfirmed(id)]).then(([at, confirmed]) => active && setStarted(at !== null || confirmed));
    return () => {
      active = false;
    };
  }, [id, syncedAt]);
  // Only school staff can be entitled to another school's results; the server decides which.
  const isStaff = useStaffSchool(staffSchools, session?.user.id, summary.lastSyncedAt?.getTime()).status === 'staff';

  const managed = useManagedAthletes(managedAthletes, athletes, session?.user.id, summary.lastSyncedAt?.getTime());
  const sources = useImportSources(importSources, summary.connection === 'connected');
  // The organization behind each imported result, from data; without a connection the marks show the generic origin.
  const sourceNames = useMemo(() => Object.fromEntries(sources.map((source) => [source.provider, source.name])), [sources]);
  // A results platform dates each result by its session: that date wins when two sources hold the same swim.
  const sessionDated = useMemo(() => sources.filter((source) => source.kind === 'platform').map((source) => source.provider), [sources]);

  if (!session) return null;
  // Only a guardian or an adult athlete is offered the import; the source's name comes from data.
  const managedAthlete = managed.status === 'ready' ? managed.athletes.find((candidate) => candidate.id === id) : undefined;
  const importPrompt =
    managedAthlete && sources[0] && !importDismissed && !started
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
          key={id}
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
      // Records waiting to be sent or that failed to send: with none, connected, the sync tag says "Al día".
      pendingChanges={summary.pending + summary.failed}
      importPrompt={importPrompt}
      onBack={goBack}
    />
  );
}
