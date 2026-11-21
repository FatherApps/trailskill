import { Link, Redirect, useRouter } from 'expo-router';
import { Text, useWindowDimensions, View } from 'react-native';

import { t } from '../../core/i18n';
import { useSession } from '../../core/session';
import { recordSyncState, useGlobalSyncSummary } from '../../core/sync';
import { useTheme } from '../../core/theme';
import { Button, StateView, SyncStatus } from '../../core/ui';
import {
  createPowerSyncManagedAthleteRepository,
  createPowerSyncOwnAuthorizationEvidence,
  createSecureStorePendingInvitationRepository,
  createSecureStoreRegistrationDraftRepository,
  resolveLanding,
  SignOutContainer,
  useFirstSyncWaitExpired,
  useOwnLandingEvidence,
} from '../../modules/accounts';
import { createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../modules/athletes';
import { createPowerSyncStaffSchoolRepository, useAdminSchool, useCoachSchool, useStaffSchool } from '../../modules/school-console';
import { createSecureStoreKnownPlatformAdminRepository, createSupabaseConflictReviewRepository, usePlatformAdmin, usePlatformAdminStatus } from '../../modules/timing';

const staffSchools = createPowerSyncStaffSchoolRepository();
const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const registrationDrafts = createSecureStoreRegistrationDraftRepository();
const pendingInvitations = createSecureStorePendingInvitationRepository();
const conflictReview = createSupabaseConflictReviewRepository();
const knownPlatformAdmin = createSecureStoreKnownPlatformAdminRepository();
const hasOwnAuthorizations = createPowerSyncOwnAuthorizationEvidence();

// "/" is the landing of every role: a school admin opens the console and a coach My swimmers; a guardian or an adult athlete with one athlete in
// total (the own profile counts) opens that profile, and with two or more opens My athletes. Everyone else (platform admins, an unclear account,
// a sync that gave up) keeps the home screen below, the fallback. This only decides the screen; the backend still decides what each person sees.
export default function Landing() {
  const { session, syncConnectFailed } = useSession();
  const userId = session?.user.id;
  const { colors, space, breakpoint } = useTheme();
  const { width } = useWindowDimensions();
  const lastSyncedAt = useGlobalSyncSummary().lastSyncedAt?.getTime();
  const waitExpired = useFirstSyncWaitExpired();
  const staff = useStaffSchool(staffSchools, userId, lastSyncedAt);
  const adminSchool = useAdminSchool(staffSchools, userId, lastSyncedAt);
  const coachSchool = useCoachSchool(staffSchools, userId, lastSyncedAt);
  const own = useOwnLandingEvidence(managedAthletes, hasOwnAuthorizations, userId, lastSyncedAt);
  const platformAdmin = usePlatformAdminStatus(conflictReview, userId, knownPlatformAdmin);
  const landing = resolveLanding({
    synced: lastSyncedAt != null,
    syncGaveUp: syncConnectFailed || waitExpired,
    // The same width the phone navigation bar checks in _layout.tsx.
    phoneBar: width < breakpoint['bp-medium'],
    // Only a found school counts as staff, and only a found admin or coach school gives a role. A failed lookup ('error') counts as nothing, as the navigation bar does: the backend still decides what is shown, and the home screen is the fallback.
    staff: [staff, adminSchool, coachSchool].some((lookup) => lookup.status === 'loading') ? 'loading' : staff.status === 'staff',
    admin: adminSchool.status === 'admin',
    coach: coachSchool.status === 'coach',
    own,
    platformAdmin,
  });
  switch (landing.kind) {
    case 'loading':
      return (
        <View style={{ flex: 1, padding: space[4], justifyContent: 'center', backgroundColor: colors['surface-0'] }}>
          <StateView kind="loading" />
        </View>
      );
    case 'console':
      return <Redirect href="/console" />;
    case 'my-swimmers':
      return <Redirect href="/my-swimmers" />;
    case 'athletes':
      return <Redirect href="/athletes" />;
    case 'athlete':
      return <Redirect href={`/athletes/${landing.athleteId}`} />;
    case 'home':
      return <Home />;
  }
}

export function Home() {
  const router = useRouter();
  const { syncConnectFailed, session } = useSession();
  const userId = session?.user.id;
  const { space } = useTheme();
  const summary = useGlobalSyncSummary();
  const state = recordSyncState({
    pending: summary.pending > 0,
    failed: summary.failed > 0,
    uploading: summary.uploading,
  });
  const lastSyncedAt = summary.lastSyncedAt?.getTime();
  // Memberships and managed athletes arrive with a sync, so each lookup runs again when one completes.
  const isStaff = useStaffSchool(staffSchools, userId, lastSyncedAt).status === 'staff';
  const managed = useManagedAthletes(managedAthletes, schoolAthletes, userId, lastSyncedAt);
  const isAdmin = useAdminSchool(staffSchools, userId, lastSyncedAt).status === 'admin';
  const isCoach = useCoachSchool(staffSchools, userId, lastSyncedAt).status === 'coach';
  const isPlatformAdmin = usePlatformAdmin(conflictReview, userId);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
      <Text>{t('home.title')}</Text>
      <SyncStatus state={state} />
      {syncConnectFailed && <Text accessibilityLiveRegion="polite">{t('sync.connect_failed')}</Text>}
      {/* The list of athletes moved to "Mis deportistas"; staff who also manage athletes have no navigation bar, so they reach it from here. */}
      {managed.status === 'ready' && managed.athletes.length > 0 && <Button label={t('home.nav.athletes')} onPress={() => router.push('/athletes')} />}
      {managed.status === 'ready' && managed.athletes.length > 0 && <Button label={t('training_plans.today.title')} onPress={() => router.push('/today')} />}
      {managed.status === 'ready' && managed.athletes.length > 0 && (
        <Button variant="secondary" label={t('accounts.authorizations.title')} onPress={() => router.push('/authorizations')} />
      )}
      {isStaff && <Button label={t('home.timing')} onPress={() => router.push('/timing')} />}
      {isStaff && <Button label={t('home.timing_series')} onPress={() => router.push('/timing?mode=series')} />}
      {isStaff && <Button label={t('home.timing_completed')} onPress={() => router.push('/timing?mode=completed')} />}
      {isStaff && <Button label={t('home.plans')} onPress={() => router.push('/plans')} />}
      {isCoach && <Button label={t('home.my_swimmers')} onPress={() => router.push('/my-swimmers')} />}
      {isAdmin && <Button label={t('home.console')} onPress={() => router.push('/console')} />}
      {isPlatformAdmin && <Button label={t('home.review_conflicts')} onPress={() => router.push('/review-conflicts')} />}
      <SignOutContainer drafts={registrationDrafts} pending={pendingInvitations} />
      {__DEV__ && <Link href="/gallery">{t('dev.gallery.open')}</Link>}
    </View>
  );
}
