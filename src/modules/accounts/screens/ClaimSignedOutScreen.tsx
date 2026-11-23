import { Text } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/ui';
import { ScreenFrame } from '../components/ScreenFrame';
import { t } from '../i18n';

export type ClaimSignedOutScreenProps = { onSignIn: () => void };

// The claim link opened with nobody signed in. PROVISIONAL (issue 1423): the link is not kept across the sign-in, so the person
// signs in or registers and opens it again; it stays valid for its 14 days.
export function ClaimSignedOutScreen({ onSignIn }: ClaimSignedOutScreenProps) {
  const { colors, typography } = useTheme();
  return (
    <ScreenFrame title={t('accounts.claim.signed_out_title')} footer={<Button label={t('accounts.claim.signed_out_action')} onPress={onSignIn} />}>
      <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('accounts.claim.signed_out_message')}</Text>
    </ScreenFrame>
  );
}
