import { Text } from 'react-native';

import { useTheme } from '../../../core/theme';
import { BackButton, Button } from '../../../core/ui';
import { ScreenFrame } from '../components/ScreenFrame';
import type { PendingInvitationRepository } from '../data/pendingInvitations';
import type { RegistrationDraftRepository } from '../data/registrationDraft';
import { t } from '../i18n';
import { SignOutContainer } from './SignOutContainer';

export type AccountContainerProps = {
  drafts: RegistrationDraftRepository;
  pending: PendingInvitationRepository;
  onDelete: () => void;
  onBack: () => void;
  /** Opens "Autorizaciones"; only a person who manages athletes gets it, and the entry is not shown without it. */
  onOpenAuthorizations?: () => void;
};

// "Mi cuenta": "Autorizaciones" for a person who manages athletes, then the two ways out, kept apart. Signing out keeps everything;
// "Eliminar mis datos" starts the 30-day deletion.
export function AccountContainer({ drafts, pending, onDelete, onBack, onOpenAuthorizations }: AccountContainerProps) {
  const { colors, typography } = useTheme();
  return (
    <ScreenFrame before={<BackButton onPress={onBack} />} title={t('accounts.account.title')}>
      {onOpenAuthorizations && <Button variant="secondary" label={t('accounts.account.authorizations')} onPress={onOpenAuthorizations} />}
      <SignOutContainer drafts={drafts} pending={pending} />
      <Button variant="stop" label={t('accounts.account.delete')} onPress={onDelete} />
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('accounts.account.delete_hint')}</Text>
    </ScreenFrame>
  );
}
