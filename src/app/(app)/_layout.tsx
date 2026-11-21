import { Stack, useRouter, useSegments } from 'expo-router';

import { useSession } from '../../core/session';
import { AppLayoutContainer } from '../../modules/school-console';
import { createSecureStoreKnownPlatformAdminRepository, createSupabaseConflictReviewRepository, usePlatformAdminRouteCorrection } from '../../modules/timing';

const conflictReview = createSupabaseConflictReviewRepository();
const knownPlatformAdmin = createSecureStoreKnownPlatformAdminRepository();

// The session gate, the registration steps and the phone bar live in school-console: this route only hands over the navigator.
export default function Layout() {
  const router = useRouter();
  const segments = useSegments();
  const { session } = useSession();
  // The landing opens from the last known platform admin answer; this one asks again in the background and corrects the route if it changed.
  usePlatformAdminRouteCorrection({ repository: conflictReview, known: knownPlatformAdmin, userId: session?.user.id, router, segments });
  return <AppLayoutContainer router={router} segments={segments} stack={<Stack screenOptions={{ headerShown: false }} />} />;
}
