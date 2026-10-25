import { View } from 'react-native';

import { Button, TextField } from '../../../core/ui';
import { CodeStep, type CodeBusy } from '../components/CodeStep';
import { OfflineBanner } from '../components/notices';
import { ProviderOptions } from '../components/ProviderOptions';
import { ScreenFrame } from '../components/ScreenFrame';
import { t } from '../i18n';

export type SignInField = 'email' | 'code';

export type SignInScreenProps = {
  values: Record<SignInField, string>;
  // The code was sent: the screen asks for it.
  codeSent?: boolean;
  errors?: { code?: 'mismatch' };
  busy?: CodeBusy;
  // No signal: what was typed stays and what needs the network says so.
  offline?: boolean;
  onChange: (field: SignInField, value: string) => void;
  onGoogle: () => void;
  onMicrosoft: () => void;
  onRequestCode: () => void;
  onSubmitCode: () => void;
  onBack: () => void;
};

// For someone who already has an account: same hierarchy as registration, Google and Microsoft before the code.
export function SignInScreen({
  values,
  codeSent = false,
  errors,
  busy,
  offline = false,
  onChange,
  onGoogle,
  onMicrosoft,
  onRequestCode,
  onSubmitCode,
  onBack,
}: SignInScreenProps) {
  return (
    <ScreenFrame
      title={t('auth.email_title')}
      before={
        <View style={{ alignItems: 'flex-start' }}>
          <Button variant="ghost" label={t('common.back')} onPress={onBack} />
        </View>
      }
    >
      {offline && <OfflineBanner />}
      <ProviderOptions offline={offline} onGoogle={onGoogle} onMicrosoft={onMicrosoft} />
      <TextField
        label={t('auth.email_label')}
        value={values.email}
        onChangeText={(text) => onChange('email', text)}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      {codeSent ? (
        <CodeStep
          email={values.email.trim()}
          code={values.code}
          error={errors?.code}
          busy={busy}
          offline={offline}
          onChange={(code) => onChange('code', code)}
          onSubmit={onSubmitCode}
          onResend={onRequestCode}
        />
      ) : (
        <Button
          variant="secondary"
          label={t('auth.send_code')}
          loading={busy === 'sending'}
          loadingLabel={t('accounts.code.sending')}
          disabledReason={offline ? t('accounts.offline.reason') : undefined}
          onPress={onRequestCode}
        />
      )}
    </ScreenFrame>
  );
}
