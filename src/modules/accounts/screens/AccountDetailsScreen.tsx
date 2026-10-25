import { View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Button, StepHeader, TextField } from '../../../core/ui';
import { CodeStep, type CodeBusy } from '../components/CodeStep';
import { InvitationBanner, OfflineBanner, type Invitation } from '../components/notices';
import { ProviderOptions } from '../components/ProviderOptions';
import { ScreenFrame } from '../components/ScreenFrame';
import { t } from '../i18n';

export type AccountDetailsField = 'name' | 'email' | 'phone' | 'code';

export type AccountDetailsScreenProps = {
  // 1-based position in the flow: depends on whether the person registers a child or themself.
  step: number;
  total: number;
  values: Record<AccountDetailsField, string>;
  // The code was sent: the screen asks for it.
  codeSent?: boolean;
  errors?: { email?: 'in_use'; code?: 'mismatch' };
  busy?: CodeBusy;
  // No signal: the draft stays as typed and what needs the network says so.
  offline?: boolean;
  invitation?: Invitation;
  onChange: (field: AccountDetailsField, value: string) => void;
  onGoogle: () => void;
  onMicrosoft: () => void;
  onRequestCode: () => void;
  onSubmitCode: () => void;
  // Goes to the sign-in screen: the email already has an account.
  onSignIn: () => void;
  onBack: () => void;
};

// Registration data: Google and Microsoft first, the six-digit code by email as the lighter alternative. No passwords.
export function AccountDetailsScreen({
  step,
  total,
  values,
  codeSent = false,
  errors,
  busy,
  offline = false,
  invitation,
  onChange,
  onGoogle,
  onMicrosoft,
  onRequestCode,
  onSubmitCode,
  onSignIn,
  onBack,
}: AccountDetailsScreenProps) {
  const { space } = useTheme();

  return (
    <ScreenFrame title={t('accounts.create_title')} subtitle={invitation?.school}>
      <StepHeader step={step} total={total} title={t('accounts.details.title')} onBack={onBack} />
      {invitation && <InvitationBanner {...invitation} />}
      {offline && <OfflineBanner />}
      <ProviderOptions offline={offline} onGoogle={onGoogle} onMicrosoft={onMicrosoft} />
      <TextField
        label={t('accounts.details.name_label')}
        value={values.name}
        onChangeText={(text) => onChange('name', text)}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
      />
      <View style={{ gap: space[2] }}>
        <TextField
          label={t('auth.email_label')}
          error={errors?.email === 'in_use' ? t('accounts.details.email_in_use') : undefined}
          value={values.email}
          onChangeText={(text) => onChange('email', text)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        {errors?.email === 'in_use' && (
          <View style={{ alignItems: 'flex-start' }}>
            <Button variant="ghost" label={t('accounts.details.sign_in')} onPress={onSignIn} />
          </View>
        )}
      </View>
      <TextField
        label={t('accounts.details.phone_label')}
        value={values.phone}
        onChangeText={(text) => onChange('phone', text)}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
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
          label={t('accounts.details.request_code')}
          loading={busy === 'sending'}
          loadingLabel={t('accounts.code.sending')}
          disabledReason={offline ? t('accounts.offline.reason') : undefined}
          onPress={onRequestCode}
        />
      )}
    </ScreenFrame>
  );
}
