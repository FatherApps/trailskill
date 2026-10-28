import { useRef, useState } from 'react';

import { useSession } from '../../../core/session';
import { ConfirmSheet } from '../../../core/ui';
import type { PendingInvitationRepository } from '../data/pendingInvitations';
import type { RegistrationDraftRepository } from '../data/registrationDraft';
import { t } from '../i18n';

// Signing out with its warning sheet. The caller puts the trigger where it belongs (a button, a back arrow) and shows `failed`
// its own way; `sheet` renders on its own. A successful sign-out needs no navigation: the session gate moves to sign-in.
export function useSignOut(drafts: RegistrationDraftRepository, pending: PendingInvitationRepository) {
  const { syncConnectFailed, signOut, session } = useSession();
  const userId = session?.user.id;
  const [blocked, setBlocked] = useState<{ unsent: number; rejected: number }>();
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);
  // State updates land after the render: a ref blocks a second press made before the loading state shows.
  const inFlight = useRef(false);

  async function signOutWith(force: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBlocked(undefined);
    setFailed(false);
    setSigningOut(true);
    try {
      const result = await (force ? signOut({ force }) : signOut());
      if (result.status === 'blocked_pending') setBlocked(result);
      // The next person on this phone must not find a registration someone left half done, nor an invitation token queued for it.
      else await Promise.all([drafts.clear(), userId ? pending.clear(userId) : undefined].map((cleared) => cleared?.catch(() => {})));
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
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

  const sheet = (
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
  );

  return { signOut: () => signOutWith(false), signingOut, failed, sheet };
}
