import { useLocalSearchParams, useRouter } from 'expo-router';

import { useGoBack } from '../../../../core/navigation';
import { useSession } from '../../../../core/session';
import { useGlobalSyncSummary } from '../../../../core/sync';
import {
  createPowerSyncManagedAthleteRepository,
  createSupabaseIdentityDocumentRepository,
  useHasValidAuthorization,
} from '../../../../modules/accounts';
import { createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../../../modules/athletes';
import {
  createSupabaseImportSourcesRepository,
  createSupabaseOfficialResultsService,
  createSupabaseOfficialSearchRepository,
  TournamentImportContainer,
} from '../../../../modules/results-import';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const sources = createSupabaseImportSourcesRepository();
const search = createSupabaseOfficialSearchRepository();
const results = createSupabaseOfficialResultsService();
const identityDocuments = createSupabaseIdentityDocumentRepository();

// "Is this person?" for one tournament: the guardian or adult athlete pastes its address and confirms before anything is imported.
export default function ImportTournament() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack();
  const { session } = useSession();
  const summary = useGlobalSyncSummary();
  const authorized = useHasValidAuthorization(id, 'import_official_results');
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, session?.user.id, summary.lastSyncedAt?.getTime());

  if (managed.status !== 'ready') return null;
  // Only a person who manages the swimmer starts it; the server checks it again on every call.
  const athlete = managed.athletes.find((candidate) => candidate.id === id);
  if (!athlete) return null;
  return (
    <TournamentImportContainer
      athlete={athlete}
      authorized={authorized}
      online={summary.connection === 'connected'}
      sources={sources}
      search={search}
      results={results}
      identityDocuments={identityDocuments}
      onGoToAuthorizations={() => router.push('/authorizations')}
      onDone={goBack}
      onBack={goBack}
    />
  );
}
