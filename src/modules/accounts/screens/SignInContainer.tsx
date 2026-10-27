import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { CodeMismatchError, useSession } from '../../../core/session';
import { useTheme } from '../../../core/theme';
import { Button, StateView, StepHeader, TextField } from '../../../core/ui';
import { t } from '../i18n';

export type SignInContainerProps = {
  onCreateAccount: () => void;
};

const CODE_LENGTH = 6;

// Email, then the 6-digit code. Signing in never asks for a name: the session gate moves on once the code checks out.
export function SignInContainer({ onCreateAccount }: SignInContainerProps) {
  const { requestCode, verifyCode, configError } = useSession();
  const { colors, space, typography } = useTheme();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [codeError, setCodeError] = useState<string>();
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const attempt = useRef(0);

  async function sendCode() {
    setSending(true);
    setRequestFailed(false);
    try {
      await requestCode(email.trim());
      setStep('code');
    } catch {
      // One message for every failure: it never reveals whether the email has an account.
      setRequestFailed(true);
    } finally {
      setSending(false);
    }
  }

  function changeCode(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    const mine = ++attempt.current;
    setCode(digits);
    setCodeError(undefined);
    setNotice(undefined);
    if (digits.length < CODE_LENGTH) return;
    verifyCode(email.trim(), digits).catch((error) => {
      // A newer edit supersedes this attempt: its late failure must not overwrite the field.
      if (mine !== attempt.current) return;
      setCodeError(error instanceof CodeMismatchError ? t('auth.code_mismatch') : t('auth.verify_failed'));
    });
  }

  async function resend() {
    setCodeError(undefined);
    setNotice(undefined);
    setResending(true);
    try {
      await requestCode(email.trim());
      setNotice(t('auth.resend_sent'));
    } catch {
      setCodeError(t('auth.resend_failed'));
    } finally {
      setResending(false);
    }
  }

  function back() {
    setStep('email');
    setCode('');
    setCodeError(undefined);
    setNotice(undefined);
  }

  return (
    <View style={{ gap: space[4] }}>
      {configError ? (
        <StateView kind="error" title={t('auth.not_configured_title')} message={t('auth.not_configured_message')} />
      ) : step === 'email' ? (
        <>
          <TextField
            label={t('auth.email_label')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
          {requestFailed && (
            <StateView kind="error" title={t('auth.request_failed_title')} message={t('auth.request_failed_message')} />
          )}
          <Button label={t('auth.send_code')} onPress={sendCode} loading={sending} />
          <Button variant="ghost" label={t('auth.create_account')} onPress={onCreateAccount} />
        </>
      ) : (
        <>
          <StepHeader step={2} total={2} title={t('auth.code_title')} onBack={back} />
          <TextField
            label={t('auth.code_label')}
            help={t('auth.code_help', { email: email.trim() })}
            error={codeError}
            value={code}
            onChangeText={changeCode}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
          />
          {notice && (
            <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors['ink-muted'] }]}>
              {notice}
            </Text>
          )}
          <Button variant="ghost" label={t('auth.resend')} onPress={resend} loading={resending} />
        </>
      )}
    </View>
  );
}
