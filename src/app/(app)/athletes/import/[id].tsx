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
  ConfirmPersonContainer,
  createSupabaseImportSourcesRepository,
  createSupabaseOfficialSearchRepository,
} from '../../../../modules/results-import';

const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const sources = createSupabaseImportSourcesRepository();
const search = createSupabaseOfficialSearchRepository();
const identityDocuments = createSupabaseIdentityDocumentRepository();

// "Is this person?": the guardian or adult athlete searches one swimmer at the official source and confirms the history found.
export default function ConfirmPerson() {
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
    <ConfirmPersonContainer
      athlete={athlete}
      authorized={authorized}
      online={summary.connection === 'connected'}
      sources={sources}
      search={search}
      identityDocuments={identityDocuments}
      onGoToAuthorizations={() => router.push('/authorizations')}
      onDone={goBack}
      onBack={goBack}
    />
  );
}
