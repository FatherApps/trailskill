import { useState } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../core/i18n';
import { CodeMismatchError, useSession } from '../../core/session';
import { useTheme } from '../../core/theme';
import { Button, StateView, StepHeader, TextField } from '../../core/ui';

const CODE_LENGTH = 6;

export default function SignIn() {
  const { requestCode, verifyCode } = useSession();
  const { colors, space, typography } = useTheme();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [codeError, setCodeError] = useState<string>();

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

  async function changeCode(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    setCodeError(undefined);
    if (digits.length < CODE_LENGTH) return;
    try {
      await verifyCode(email.trim(), digits);
    } catch (error) {
      setCodeError(error instanceof CodeMismatchError ? t('auth.code_mismatch') : t('auth.verify_failed'));
    }
  }

  async function resend() {
    setCodeError(undefined);
    try {
      await requestCode(email.trim());
    } catch {
      setCodeError(t('auth.verify_failed'));
    }
  }

  function back() {
    setStep('email');
    setCode('');
    setCodeError(undefined);
  }

  return (
    <View style={{ flex: 1, padding: space[4], gap: space[4], backgroundColor: colors['surface-0'] }}>
      {step === 'email' ? (
        <>
          <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
            {t('auth.email_title')}
          </Text>
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
          <Button variant="ghost" label={t('auth.resend')} onPress={resend} />
        </>
      )}
    </View>
  );
}
