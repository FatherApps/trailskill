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
};

// "Mi cuenta": the two ways out, kept apart. Signing out keeps everything; "Eliminar mis datos" starts the 30-day deletion.
export function AccountContainer({ drafts, pending, onDelete, onBack }: AccountContainerProps) {
  const { colors, typography } = useTheme();
  return (
    <ScreenFrame before={<BackButton onPress={onBack} />} title={t('accounts.account.title')}>
      <SignOutContainer drafts={drafts} pending={pending} />
      <Button variant="stop" label={t('accounts.account.delete')} onPress={onDelete} />
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('accounts.account.delete_hint')}</Text>
    </ScreenFrame>
  );
}
