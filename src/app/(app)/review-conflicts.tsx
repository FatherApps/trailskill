import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { createSupabaseConflictReviewRepository, ReviewConflictsFlow } from '../../modules/timing';

const repository = createSupabaseConflictReviewRepository();

// Hiding the screen is not the protection: the list and the resolution are checked by the backend, which only lets a platform admin through.
export default function ReviewConflictsRoute() {
  const { session } = useSession();
  const { connection } = useGlobalSyncSummary();
  // The hook's router stays bound after the Activity is recreated; the module-level one does not.
  const router = useRouter();
  const onDenied = useCallback(() => router.replace('/'), [router]);
  const onBack = useCallback(() => router.back(), [router]);
  return <ReviewConflictsFlow repository={repository} userId={session?.user.id} offline={connection === 'offline'} onDenied={onDenied} onBack={onBack} />;
}
