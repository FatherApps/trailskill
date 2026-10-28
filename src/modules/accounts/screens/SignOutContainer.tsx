import { Text } from 'react-native';

import { Button } from '../../../core/ui';
import type { PendingInvitationRepository } from '../data/pendingInvitations';
import type { RegistrationDraftRepository } from '../data/registrationDraft';
import { t } from '../i18n';
import { useSignOut } from './useSignOut';

type Props = {
  drafts: RegistrationDraftRepository;
  pending: PendingInvitationRepository;
};

// The sign-out button with its warning sheet and failure message. It renders no wrapper, so the screen around it lays it out.
export function SignOutContainer({ drafts, pending }: Props) {
  const { signOut, signingOut, failed, sheet } = useSignOut(drafts, pending);

  return (
    <>
      <Button variant="secondary" label={t('session.sign_out')} onPress={signOut} loading={signingOut} />
      {failed && <Text accessibilityLiveRegion="polite">{t('session.sign_out_failed')}</Text>}
      {sheet}
    </>
  );
}
