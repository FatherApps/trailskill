import { router, useLocalSearchParams } from 'expo-router';

import { useSession } from '../../../core/session';
import { RecordSyncStatus } from '../../../core/sync';
import {
  AddAthletesContainer,
  createPowerSyncManagedAthleteProfileRepository,
  createPowerSyncManagedAthleteRepository,
  type AthleteDraftStore,
} from '../../../modules/accounts';
import { createPowerSyncAthleteRepository, createPowerSyncSchoolAthleteRepository } from '../../../modules/athletes';

const athletes = createPowerSyncAthleteRepository(createPowerSyncManagedAthleteRepository(), createPowerSyncSchoolAthleteRepository());
const profiles = createPowerSyncManagedAthleteProfileRepository(athletes);

// Placeholder until RegistrationDraftRepository (task 2.3, #41) lands: it only survives while the app process lives.
let draft: Awaited<ReturnType<AthleteDraftStore['load']>> = null;
const draftStore: AthleteDraftStore = {
  load: async () => draft,
  save: async (next) => {
    draft = next;
  },
};

export default function AddAthletesRoute() {
  const { relation } = useLocalSearchParams<{ relation?: string }>();
  const { session } = useSession();

  if (!session) return null;
  return (
    <AddAthletesContainer
      userId={session.user.id}
      relation={relation === 'self' ? 'self' : 'guardian'}
      profiles={profiles}
      athletes={athletes}
      draft={draftStore}
      renderStatus={(id) => <RecordSyncStatus table="athletes" id={id} />}
      onContinue={() => router.replace('/')}
      onBack={() => router.back()}
    />
  );
}
