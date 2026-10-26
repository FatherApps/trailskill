import { router } from 'expo-router';

import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { createSupabaseConflictReviewRepository, ReviewConflictsFlow } from '../../modules/timing';

const repository = createSupabaseConflictReviewRepository();

// Hiding the screen is not the protection: the list and the resolution are checked by the backend, which only lets a platform admin through.
export default function ReviewConflictsRoute() {
  const { session } = useSession();
  const { connection } = useGlobalSyncSummary();
  return (
    <ReviewConflictsFlow
      repository={repository}
      userId={session?.user.id}
      offline={connection === 'offline'}
      onDenied={() => router.replace('/')}
      onBack={() => router.back()}
    />
  );
}
