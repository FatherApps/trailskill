import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../core/i18n';
import { useSession } from '../../core/session';
import { recordSyncState, useGlobalSyncSummary } from '../../core/sync';
import { useTheme } from '../../core/theme';
import { Button, ConfirmSheet, SyncStatus } from '../../core/ui';

export default function Home() {
  const { syncConnectFailed, signOut } = useSession();
  const { space } = useTheme();
  const summary = useGlobalSyncSummary();
  const state = recordSyncState({
    pending: summary.pending > 0,
    failed: summary.failed > 0,
    uploading: summary.uploading,
  });
  const [blocked, setBlocked] = useState<{ unsent: number; rejected: number }>();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  // A successful sign-out needs no navigation: the session gate moves to sign-in on its own.
  async function signOutWith(force: boolean) {
    setBlocked(undefined);
    setSignOutFailed(false);
    setSigningOut(true);
    try {
      const result = await (force ? signOut({ force }) : signOut());
      if (result.status === 'blocked_pending') setBlocked(result);
    } catch {
      setSignOutFailed(true);
    } finally {
      setSigningOut(false);
    }
  }

  const pendingMessage = blocked
    ? [
        t('session.sign_out_pending_message', { count: blocked.unsent }),
        // Rejected records are not retried on their own: "Seguir y enviar" must not promise to send them.
        ...(blocked.rejected > 0 ? [t('session.sign_out_rejected', { count: blocked.rejected })] : []),
      ].join(' ')
    : '';

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
      <Text>{t('home.title')}</Text>
      <SyncStatus state={state} />
      {syncConnectFailed && <Text accessibilityLiveRegion="polite">{t('sync.connect_failed')}</Text>}
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
