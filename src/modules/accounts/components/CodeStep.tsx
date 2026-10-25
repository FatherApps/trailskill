import { View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Button, TextField } from '../../../core/ui';
import { t } from '../i18n';

export type CodeBusy = 'sending' | 'verifying';

export type CodeStepProps = {
  email: string;
  code: string;
  error?: 'mismatch';
  busy?: CodeBusy;
  offline?: boolean;
  onChange: (code: string) => void;
  onSubmit: () => void;
  onResend: () => void;
};

const CODE_LENGTH = 6;

// What follows once the code was sent. Both buttons need the network, so offline they say so.
export function CodeStep({ email, code, error, busy, offline = false, onChange, onSubmit, onResend }: CodeStepProps) {
  const { space } = useTheme();
  const disabledReason = offline ? t('accounts.offline.reason') : undefined;

  return (
    <View style={{ gap: space[4] }}>
      <TextField
        label={t('auth.code_label')}
        help={t('auth.code_help', { email })}
        error={error === 'mismatch' ? t('auth.code_mismatch') : undefined}
        value={code}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
      />
      <Button
        label={t('accounts.code.verify')}
        loading={busy === 'verifying'}
        loadingLabel={t('accounts.code.verifying')}
        disabledReason={disabledReason}
        onPress={onSubmit}
      />
      <Button
        variant="ghost"
        label={t('auth.resend')}
        loading={busy === 'sending'}
        loadingLabel={t('accounts.code.sending')}
        disabledReason={disabledReason}
        onPress={onResend}
      />
    </View>
  );
}
