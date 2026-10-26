import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../core/i18n';
import { useSession } from '../../core/session';
import { recordSyncState, useGlobalSyncSummary } from '../../core/sync';
import { useTheme } from '../../core/theme';
import { Button, ConfirmSheet, SwimmerRow, SyncStatus } from '../../core/ui';
import {
  createPowerSyncManagedAthleteRepository,
  createSecureStorePendingInvitationRepository,
  createSecureStoreRegistrationDraftRepository,
} from '../../modules/accounts';
import { athleteDisplay, createPowerSyncSchoolAthleteRepository, useManagedAthletes } from '../../modules/athletes';
import { createPowerSyncStaffSchoolRepository, useAdminSchool, useStaffSchool } from '../../modules/school-console';
import { createSupabaseConflictReviewRepository, usePlatformAdmin } from '../../modules/timing';

const staffSchools = createPowerSyncStaffSchoolRepository();
const managedAthletes = createPowerSyncManagedAthleteRepository();
const schoolAthletes = createPowerSyncSchoolAthleteRepository();
const registrationDrafts = createSecureStoreRegistrationDraftRepository();
const pendingInvitations = createSecureStorePendingInvitationRepository();
const conflictReview = createSupabaseConflictReviewRepository();

export default function Home() {
  const { syncConnectFailed, signOut, session } = useSession();
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
  const isPlatformAdmin = usePlatformAdmin(conflictReview, userId);
  const [blocked, setBlocked] = useState<{ unsent: number; rejected: number }>();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  // State updates land after the render: a ref blocks a second press made before the loading state shows.
  const signOutInFlight = useRef(false);

  // A successful sign-out needs no navigation: the session gate moves to sign-in on its own.
  async function signOutWith(force: boolean) {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    setBlocked(undefined);
    setSignOutFailed(false);
    setSigningOut(true);
    try {
      const result = await (force ? signOut({ force }) : signOut());
      if (result.status === 'blocked_pending') setBlocked(result);
      // The next person on this phone must not find a registration someone left half done, nor an invitation token queued for it.
      else await Promise.all([registrationDrafts.clear(), userId ? pendingInvitations.clear(userId) : undefined].map((cleared) => cleared?.catch(() => {})));
    } catch {
      setSignOutFailed(true);
    } finally {
      signOutInFlight.current = false;
      setSigningOut(false);
    }
  }

  const pendingMessage = blocked
    ? [
        t('session.sign_out_pending_message', { count: blocked.unsent }),
        // Rejected records are not retried on their own: "Seguir y enviar" must not promise to send them.
        ...(blocked.rejected > 0 ? [t('session.sign_out_rejected', { count: blocked.rejected })] : []),
        // Without a connection nothing is being sent: the records wait for it.
        ...(syncConnectFailed ? [t('session.sign_out_offline')] : []),
      ].join(' ')
    : '';

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
      <Text>{t('home.title')}</Text>
      <SyncStatus state={state} />
      {syncConnectFailed && <Text accessibilityLiveRegion="polite">{t('sync.connect_failed')}</Text>}
      {managed.status === 'ready' &&
        managed.athletes.map((athlete, index) => {
          const { shortName, initials, color } = athleteDisplay(athlete, index);
          return (
            <SwimmerRow
              key={athlete.id}
              name={shortName}
              initials={initials}
              color={color}
              detail=""
              chevron
              onPress={() => router.push(`/athletes/${athlete.id}`)}
            />
          );
        })}
      {managed.status === 'ready' && managed.athletes.length > 0 && <Button label={t('training_plans.today.title')} onPress={() => router.push('/today')} />}
      {managed.status === 'ready' && managed.athletes.length > 0 && (
        <Button variant="secondary" label={t('accounts.authorizations.title')} onPress={() => router.push('/authorizations')} />
      )}
      {isStaff && <Button label={t('home.timing')} onPress={() => router.push('/timing')} />}
      {isStaff && <Button label={t('home.timing_series')} onPress={() => router.push('/timing?mode=series')} />}
      {isStaff && <Button label={t('home.timing_completed')} onPress={() => router.push('/timing?mode=completed')} />}
      {isStaff && <Button label={t('home.plans')} onPress={() => router.push('/plans')} />}
      {isAdmin && <Button label={t('home.console')} onPress={() => router.push('/console')} />}
      {isPlatformAdmin && <Button label={t('home.review_conflicts')} onPress={() => router.push('/review-conflicts')} />}
      <Button variant="secondary" label={t('session.sign_out')} onPress={() => signOutWith(false)} loading={signingOut} />
      {signOutFailed && <Text accessibilityLiveRegion="polite">{t('session.sign_out_failed')}</Text>}
      {__DEV__ && <Link href="/gallery">{t('dev.gallery.open')}</Link>}
      <ConfirmSheet
        visible={blocked !== undefined}
        title={t('session.sign_out_pending_title')}
        message={pendingMessage}
        confirmLabel={t('session.sign_out_anyway')}
        cancelLabel={t('session.sign_out_keep')}
        destructive
        onConfirm={() => signOutWith(true)}
        // Nothing to trigger: PowerSync keeps retrying the pending records while connected.
        onCancel={() => setBlocked(undefined)}
      />
    </View>
  );
}
