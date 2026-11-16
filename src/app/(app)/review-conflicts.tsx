import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useSession } from '../../core/session';
import { useGlobalSyncSummary } from '../../core/sync';
import { createPowerSyncStaffSchoolRepository, useStaffSchool } from '../../modules/school-console';
import { createSupabaseConflictReviewRepository, ReviewConflictsFlow } from '../../modules/timing';

const repository = createSupabaseConflictReviewRepository();
const staffSchools = createPowerSyncStaffSchoolRepository();

// Hiding the screen is not the protection: the backend limits the list to the user's school (a platform admin sees all) and only lets a platform admin resolve.
export default function ReviewConflictsRoute() {
  const { session } = useSession();
  const { connection, lastSyncedAt } = useGlobalSyncSummary();
  // Memberships arrive with a sync, so the lookup runs again when one completes. A failed lookup counts as no staff, as the landing does.
  const lookup = useStaffSchool(staffSchools, session?.user.id, lastSyncedAt?.getTime());
  const staff = lookup.status === 'loading' ? 'loading' : lookup.status === 'staff';
  // The hook's router stays bound after the Activity is recreated; the module-level one does not.
  const router = useRouter();
  const onDenied = useCallback(() => router.replace('/'), [router]);
  const onBack = useCallback(() => router.back(), [router]);
  return <ReviewConflictsFlow repository={repository} userId={session?.user.id} staff={staff} offline={connection === 'offline'} onDenied={onDenied} onBack={onBack} />;
}
