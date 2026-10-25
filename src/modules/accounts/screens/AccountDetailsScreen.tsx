import { View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Button, StateView, StepHeader, TextField } from '../../../core/ui';
import { CodeStep, type CodeBusy } from '../components/CodeStep';
import { InvalidInvitationBanner, InvitationBanner, OfflineBanner, type Invitation } from '../components/notices';
import { ProviderOptions } from '../components/ProviderOptions';
import { ScreenFrame } from '../components/ScreenFrame';
import { t } from '../i18n';

export type AccountDetailsField = 'firstName' | 'lastName' | 'email' | 'code';

export type AccountDetailsScreenProps = {
  // 1-based position in the flow: depends on whether the person registers a child or themself.
  step: number;
  total: number;
  values: Record<AccountDetailsField, string>;
  // The code was sent: the screen asks for it.
  codeSent?: boolean;
  errors?: {
    firstName?: 'required';
    lastName?: 'required';
    email?: 'required' | 'invalid' | 'in_use';
    code?: 'mismatch';
  };
  busy?: CodeBusy;
  // No signal: the draft stays as typed and what needs the network says so.
  offline?: boolean;
  // A request that failed: explained with a retry, the draft untouched.
  failure?: 'offline' | 'request_failed' | 'verify_failed';
  onRetry?: () => void;
  // Google and Microsoft sign-in; registration hides them until they can create accounts.
  providers?: boolean;
  invitation?: Invitation;
  // The link was unknown, expired or revoked.
  invalidInvitation?: boolean;
  onChange: (field: AccountDetailsField, value: string) => void;
  onGoogle?: () => void;
  onMicrosoft?: () => void;
  onRequestCode: () => void;
  onSubmitCode: () => void;
  // Goes to the sign-in screen: the email already has an account.
  onSignIn: () => void;
  onBack: () => void;
};

const noop = () => {};

const emailErrorKeys = {
  required: 'accounts.details.email_required',
  invalid: 'accounts.details.email_invalid',
  in_use: 'accounts.details.email_in_use',
} as const;

function FailureNotice({ failure, onRetry }: { failure: NonNullable<AccountDetailsScreenProps['failure']>; onRetry?: () => void }) {
  const action = onRetry ? { label: t('sync.retry'), onPress: onRetry } : undefined;
  if (failure === 'offline') {
    return <StateView kind="offline" title={t('accounts.failure.offline_title')} message={t('accounts.failure.offline_message')} action={action} />;
  }
  const request = failure === 'request_failed';
  return (
    <StateView
      kind="error"
      title={t(request ? 'auth.request_failed_title' : 'auth.verify_failed')}
      message={t(request ? 'auth.request_failed_message' : 'accounts.failure.kept')}
      action={action}
    />
  );
}

// Registration data: Google and Microsoft first, the six-digit code by email as the lighter alternative. No passwords.
export function AccountDetailsScreen({
  step,
  total,
  values,
  codeSent = false,
  errors,
  busy,
  offline = false,
  failure,
  onRetry,
  providers = true,
  invitation,
  invalidInvitation,
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
      {invalidInvitation && <InvalidInvitationBanner />}
      {offline && <OfflineBanner />}
      {providers && <ProviderOptions offline={offline} onGoogle={onGoogle ?? noop} onMicrosoft={onMicrosoft ?? noop} />}
      {failure && <FailureNotice failure={failure} onRetry={onRetry} />}
      <TextField
        label={t('accounts.details.first_name_label')}
        error={errors?.firstName ? t('accounts.details.first_name_required') : undefined}
        value={values.firstName}
        onChangeText={(text) => onChange('firstName', text)}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
      />
      <TextField
        label={t('accounts.details.last_name_label')}
        error={errors?.lastName ? t('accounts.details.last_name_required') : undefined}
        value={values.lastName}
        onChangeText={(text) => onChange('lastName', text)}
        autoCapitalize="words"
        autoComplete="family-name"
        textContentType="familyName"
      />
      <View style={{ gap: space[2] }}>
        <TextField
          label={t('auth.email_label')}
          error={errors?.email ? t(emailErrorKeys[errors.email]) : undefined}
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
