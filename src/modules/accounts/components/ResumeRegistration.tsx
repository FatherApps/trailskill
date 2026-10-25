import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Button, ConfirmSheet, StateView } from '../../../core/ui';
import { t } from '../i18n';

export type ResumeRegistrationProps = {
  email: string;
  onResume: () => void;
  // Deletes the draft; only called once the person confirms.
  onRestart: () => void;
};

// Shown on the sign-in when a registration was left unfinished on this phone: it never moves the person on its own.
export function ResumeRegistration({ email, onResume, onRestart }: ResumeRegistrationProps) {
  const { space } = useTheme();
  const [confirming, setConfirming] = useState(false);

  return (
    <View style={{ gap: space[3] }}>
      <StateView
        kind="empty"
        title={t('accounts.resume.title')}
        message={t('accounts.resume.message')}
        action={{ label: t('accounts.resume.resume', { email }), onPress: onResume }}
      />
      <Button variant="ghost" label={t('accounts.resume.restart')} onPress={() => setConfirming(true)} />
      <ConfirmSheet
        visible={confirming}
        title={t('accounts.resume.confirm_title')}
        message={t('accounts.resume.confirm_message')}
        confirmLabel={t('accounts.resume.confirm')}
        cancelLabel={t('accounts.resume.keep')}
        destructive
        onConfirm={() => {
          setConfirming(false);
          onRestart();
        }}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}
