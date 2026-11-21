import { useState } from 'react';
import { Share, Text, View } from 'react-native';

import { namedText, t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, ConfirmSheet, StateView } from '../../../core/ui';
import type { ShareCodeCache } from '../data/athleteShareCodeCache';
import type { AthleteShareCodeRepository } from '../data/athleteShareCodes';
import { ShareCodeQr } from '../components/ShareCodeQr';
import { useAthleteShareCode } from '../data/useAthleteShareCode';
import '../i18n';

export type AthleteShareCodeContainerProps = {
  athleteId: string;
  // The swimmer's first name, for the texts.
  athleteName: string;
  repository: AthleteShareCodeRepository;
  // The last code known per user and swimmer: it shows without signal.
  cache: ShareCodeCache;
  userId: string | undefined;
  // Without signal the last known code shows; without one saved, nothing but the request for signal.
  online: boolean;
  // Injected by tests; otherwise the system share sheet, which also copies.
  share?: (message: string) => Promise<unknown>;
};

const defaultShare = (message: string) => Share.share({ message });

// "Código para compartir tiempos": shown on the swimmer's profile to who manages them (the server refuses anyone else).
export function AthleteShareCodeContainer({ athleteId, athleteName, repository, cache, userId, online, share = defaultShare }: AthleteShareCodeContainerProps) {
  const { colors, space, radius, typography } = useTheme();
  const [attempt, setAttempt] = useState(0);
  const { state: shown, replace } = useAthleteShareCode({ repository, cache, userId, athleteId, online, attempt });
  const [confirming, setConfirming] = useState(false);
  const [qr, setQr] = useState(false);
  const [changeError, setChangeError] = useState(false);

  async function change() {
    setConfirming(false);
    try {
      replace(await repository.change(athleteId));
      setChangeError(false);
    } catch {
      setChangeError(true);
    }
  }

  let body;
  if (!online && shown.status !== 'ready') body = <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('accounts.share_code.offline')}</Text>;
  else if (shown.status === 'loading') body = <StateView kind="loading" />;
  else if (shown.status === 'error')
    body = (
      <StateView
        kind="error"
        title={t('accounts.share_code.error_title')}
        message={t('accounts.share_code.error_message')}
        action={{ label: t('accounts.share_code.retry'), onPress: () => setAttempt((n) => n + 1) }}
      />
    );
  else
    body = (
      <View style={{ gap: space[3] }}>
        <Text selectable accessibilityLabel={t('accounts.share_code.code_label', { code: shown.code })} style={[typography['time-md'], { color: colors.ink }]}>
          {shown.code}
        </Text>
        {changeError && (
          <Banner variant="warn" icon="error">
            {t('accounts.share_code.change_error')}
          </Banner>
        )}
        <Button
          variant="secondary"
          label={t('accounts.share_code.share')}
          onPress={() => share(t('accounts.share_code.share_message', { code: shown.code })).catch(() => {})}
        />
        <Button variant="secondary" label={t(qr ? 'accounts.share_code.hide_qr' : 'accounts.share_code.show_qr')} onPress={() => setQr((shownNow) => !shownNow)} />
        {qr && <ShareCodeQr code={shown.code} />}
        <Button
          variant="ghost"
          label={t('accounts.share_code.change')}
          onPress={() => { setConfirming(true); setChangeError(false); }}
          disabledReason={online ? undefined : t('accounts.share_code.change_offline')}
        />
        <ConfirmSheet
          visible={confirming}
          title={t('accounts.share_code.change_title')}
          message={t('accounts.share_code.change_message')}
          confirmLabel={t('accounts.share_code.change_confirm')}
          cancelLabel={t('accounts.share_code.change_cancel')}
          destructive
          onConfirm={change}
          onCancel={() => setConfirming(false)}
        />
      </View>
    );

  return (
    <View style={{ gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'], borderWidth: 1, borderColor: colors.border }}>
      <Text accessibilityRole="header" style={[typography['body-strong'], { color: colors.ink }]}>
        {t('accounts.share_code.title')}
      </Text>
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{namedText('accounts.share_code.help', athleteName)}</Text>
      {body}
    </View>
  );
}
