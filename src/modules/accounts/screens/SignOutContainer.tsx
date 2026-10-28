import { useRef, useState } from 'react';
import { Text } from 'react-native';

import { useSession } from '../../../core/session';
import { Button, ConfirmSheet } from '../../../core/ui';
import type { PendingInvitationRepository } from '../data/pendingInvitations';
import type { RegistrationDraftRepository } from '../data/registrationDraft';
import { t } from '../i18n';

type Props = {
  drafts: RegistrationDraftRepository;
  pending: PendingInvitationRepository;
};

// The sign-out button with its warning sheet and failure message. It renders no wrapper, so the screen around it lays it out.
export function SignOutContainer({ drafts, pending }: Props) {
  const { syncConnectFailed, signOut, session } = useSession();
  const userId = session?.user.id;
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
      else await Promise.all([drafts.clear(), userId ? pending.clear(userId) : undefined].map((cleared) => cleared?.catch(() => {})));
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
    <>
      <Button variant="secondary" label={t('session.sign_out')} onPress={() => signOutWith(false)} loading={signingOut} />
      {signOutFailed && <Text accessibilityLiveRegion="polite">{t('session.sign_out_failed')}</Text>}
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
    </>
  );
}
