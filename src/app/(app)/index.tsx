import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../core/i18n';
import { useSession } from '../../core/session';
import { recordSyncState, useGlobalSyncSummary } from '../../core/sync';
import { useTheme } from '../../core/theme';
import { Button, ConfirmSheet, SyncStatus } from '../../core/ui';
import { createPowerSyncStaffSchoolRepository, useAdminSchool } from '../../modules/school-console';

const staffSchools = createPowerSyncStaffSchoolRepository();

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
  const [isStaff, setIsStaff] = useState(false);
  const lastSyncedAt = summary.lastSyncedAt?.getTime();
  // Memberships arrive with a sync, so the lookup runs again when one completes. A failure keeps the button hidden.
  useEffect(() => {
    let active = true;
    if (userId) {
      staffSchools
        .listStaffSchools(userId)
        .then((schools) => active && setIsStaff(schools.length > 0))
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [userId, lastSyncedAt]);
  const isAdmin = useAdminSchool(staffSchools, userId, lastSyncedAt).status === 'admin';
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
      {isStaff && <Button label={t('home.plans')} onPress={() => router.push('/plans')} />}
      {isAdmin && <Button label={t('home.console')} onPress={() => router.push('/console')} />}
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
