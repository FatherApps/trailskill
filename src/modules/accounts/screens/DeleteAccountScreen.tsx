import { Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { BackButton, Banner, Button, StateView, TextField } from '../../../core/ui';
import { formatDeletionDate } from '../components/deletionDate';
import { OfflineNotice } from '../components/OfflineNotice';
import { ScreenFrame } from '../components/ScreenFrame';
import { t } from '../i18n';

export type DeleteAccountError = 'invalid_code' | 'code_expired' | 'too_many_attempts' | 'rate_limited' | 'unavailable';

// One step at a time: the offer to export, the notice, the code, the date that was set, and the two ways the server can refuse.
export type DeleteAccountView =
  | { step: 'offer'; canExport: boolean; exportFailed?: boolean }
  | { step: 'notice'; error?: DeleteAccountError }
  | { step: 'code'; code: string; error?: DeleteAccountError; emailNotSent?: boolean }
  | { step: 'done'; deleteAfter: string; leaveFailed?: boolean }
  // The names of the schools the server says still link the account.
  | { step: 'blocked'; schools: string[] }
  | { step: 'admin' };

export type DeleteAccountScreenProps = {
  view: DeleteAccountView;
  // No signal: asking for the code, confirming and the export say so and do not call the server.
  online: boolean;
  busy?: 'exporting' | 'requesting' | 'confirming' | 'leaving';
  onExport: () => void;
  onContinue: () => void;
  onRequestCode: () => void;
  onChangeCode: (code: string) => void;
  onConfirm: () => void;
  onLeave: () => void;
  onBack: () => void;
};

const CODE_LENGTH = 6;

function Notice({ message }: { message: string }) {
  const { colors, typography } = useTheme();
  return <Text style={[typography.body, { color: colors.ink }]}>{message}</Text>;
}

export function DeleteAccountScreen({ view, online, busy, onExport, onContinue, onRequestCode, onChangeCode, onConfirm, onLeave, onBack }: DeleteAccountScreenProps) {
  const { colors, space, typography } = useTheme();
  const offlineReason = online ? undefined : t('accounts.offline.reason');
  const back = view.step === 'done' ? undefined : <BackButton onPress={onBack} />;

  if (view.step === 'blocked') {
    const message =
      view.schools.length === 0
        ? t('accounts.delete.blocked_message_none')
        : t('accounts.delete.blocked_message', { count: view.schools.length, schools: view.schools.join(', ') });
    return (
      <ScreenFrame before={back} title={t('accounts.delete.title')}>
        <StateView kind="error" title={t('accounts.delete.blocked_title')} message={message} />
      </ScreenFrame>
    );
  }
  if (view.step === 'admin') {
    return (
      <ScreenFrame before={back} title={t('accounts.delete.title')}>
        <StateView kind="error" title={t('accounts.delete.admin_title')} message={t('accounts.delete.admin_message')} />
      </ScreenFrame>
    );
  }
  if (view.step === 'done') {
    return (
      <ScreenFrame
        title={t('accounts.delete.done_title')}
        footer={<Button label={t('accounts.delete.done_leave')} loading={busy === 'leaving'} onPress={onLeave} />}
      >
        <Text accessibilityRole="header" style={[typography.subtitle, { color: colors.ink }]}>
          {t('accounts.delete.done_date', { date: formatDeletionDate(view.deleteAfter) })}
        </Text>
        <Notice message={t('accounts.delete.done_help')} />
        {view.leaveFailed ? <Banner variant="warn">{t('accounts.delete.leave_failed')}</Banner> : null}
      </ScreenFrame>
    );
  }
  if (view.step === 'offer') {
    return (
      <ScreenFrame before={back} title={t('accounts.delete.offer_title')}>
        <Notice message={t('accounts.delete.offer_body')} />
        {view.exportFailed ? <Banner variant="warn">{t('accounts.delete.export_failed')}</Banner> : null}
        {!online ? <OfflineNotice>{t('accounts.delete.offline')}</OfflineNotice> : null}
        <View style={{ gap: space[3] }}>
          {view.canExport ? (
            <Button
              variant="secondary"
              label={t('accounts.delete.export')}
              loading={busy === 'exporting'}
              loadingLabel={t('accounts.delete.exporting')}
              disabledReason={offlineReason}
              onPress={onExport}
            />
          ) : null}
          <Button label={t('accounts.delete.continue')} onPress={onContinue} />
        </View>
      </ScreenFrame>
    );
  }
  if (view.step === 'notice') {
    return (
      <ScreenFrame before={back} title={t('accounts.delete.notice_title')}>
        <View style={{ gap: space[3] }}>
          <Notice message={t('accounts.delete.notice_days')} />
          <Notice message={t('accounts.delete.notice_irreversible')} />
          <Notice message={t('accounts.delete.notice_pending')} />
          <Notice message={t('accounts.delete.notice_cancel')} />
        </View>
        {view.error ? <Banner variant="warn">{t(`accounts.delete.error.${view.error}`)}</Banner> : null}
        {!online ? <OfflineNotice>{t('accounts.delete.offline')}</OfflineNotice> : null}
        <Button
          variant="stop"
          label={t('accounts.delete.request_code')}
          loading={busy === 'requesting'}
          loadingLabel={t('accounts.delete.requesting')}
          disabledReason={offlineReason}
          onPress={onRequestCode}
        />
      </ScreenFrame>
    );
  }
  return (
    <ScreenFrame before={back} title={t('accounts.delete.code_title')}>
      <TextField
        label={t('accounts.delete.code_label')}
        help={t('accounts.delete.code_help')}
        error={view.error === 'invalid_code' ? t('accounts.delete.error.invalid_code') : undefined}
        value={view.code}
        onChangeText={(text) => onChangeCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
      />
      {view.error && view.error !== 'invalid_code' ? <Banner variant="warn">{t(`accounts.delete.error.${view.error}`)}</Banner> : null}
      {view.emailNotSent ? <Banner variant="warn">{t('accounts.delete.email_not_sent')}</Banner> : null}
      {!online ? <OfflineNotice>{t('accounts.delete.offline')}</OfflineNotice> : null}
      <Button
        variant="stop"
        label={t('accounts.delete.confirm')}
        loading={busy === 'confirming'}
        loadingLabel={t('accounts.delete.confirming')}
        disabledReason={view.code.length === CODE_LENGTH ? offlineReason : t('accounts.delete.code_label')}
        onPress={onConfirm}
      />
      <Button
        variant="ghost"
        label={t('accounts.delete.resend')}
        loading={busy === 'requesting'}
        loadingLabel={t('accounts.delete.requesting')}
        disabledReason={offlineReason}
        onPress={onRequestCode}
      />
    </ScreenFrame>
  );
}
