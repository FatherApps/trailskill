import { useRef } from 'react';

import { ConfirmSheet } from '../../../core/ui';
import { t } from '../i18n';

export type ExistingAccountSheetProps = {
  // The address that was just verified, so the person sees which account it is.
  email: string;
  // The existing sign-out, never forced: it refuses while records are unsent.
  signOut: () => Promise<{ status: string }>;
  // Closes the sheet and leaves the person in the app.
  onClose: () => void;
};

// Shown once the code checked out and the account already had a profile: the session is open, so entering just closes the sheet.
// Only the cancel button signs out; back and a tap outside just close the sheet. Records that cannot be sent keep the person in the app,
// where the sign-out button asks before discarding them.
export function ExistingAccountSheet({ email, signOut, onClose }: ExistingAccountSheetProps) {
  const leaving = useRef(false);

  // A successful sign-out needs no navigation: the session gate moves to sign-in on its own.
  async function leave() {
    if (leaving.current) return;
    leaving.current = true;
    try {
      if ((await signOut()).status === 'signed_out') return;
    } catch {}
    leaving.current = false;
    onClose();
  }

  return (
    <ConfirmSheet
      visible
      title={t('accounts.details.email_in_use')}
      message={email}
      confirmLabel={t('accounts.details.sign_in')}
      cancelLabel={t('session.sign_out')}
      onConfirm={onClose}
      onCancel={leave}
      onDismiss={onClose}
    />
  );
}
