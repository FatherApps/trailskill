import { useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';

import { namedText, t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, ConfirmSheet, StateView } from '../../../core/ui';
import type { AthleteShareCodeRepository } from '../data/athleteShareCodes';
import '../i18n';

export type AthleteShareCodeContainerProps = {
  athleteId: string;
  // The swimmer's first name, for the texts.
  athleteName: string;
  repository: AthleteShareCodeRepository;
  // The code lives on the server: without signal it is not shown.
  online: boolean;
  // Injected by tests; otherwise the system share sheet, which also copies.
  share?: (message: string) => Promise<unknown>;
};

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; code: string; confirming: boolean; changeError: boolean };

const defaultShare = (message: string) => Share.share({ message });

// "Código para compartir tiempos": shown on the swimmer's profile to who manages them (the server refuses anyone else).
export function AthleteShareCodeContainer({ athleteId, athleteName, repository, online, share = defaultShare }: AthleteShareCodeContainerProps) {
  const { colors, space, radius, typography } = useTheme();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<string | null>(null);
  const key = `${athleteId}:${attempt}`;

  useEffect(() => {
    if (!online) return;
    let active = true;
    repository
      .get(athleteId)
      .then((code) => {
        if (!active) return;
        setRead(key);
        setState({ status: 'ready', code, confirming: false, changeError: false });
      })
      .catch(() => {
        if (!active) return;
        setRead(key);
        setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [repository, athleteId, online, key]);

  const shown: State = read === key ? state : { status: 'loading' };

  async function change() {
    if (shown.status !== 'ready') return;
    try {
      const code = await repository.change(athleteId);
      setState({ status: 'ready', code, confirming: false, changeError: false });
    } catch {
      setState({ ...shown, confirming: false, changeError: true });
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
        {shown.changeError && (
          <Banner variant="warn" icon="error">
            {t('accounts.share_code.change_error')}
          </Banner>
        )}
        <Button
          variant="secondary"
          label={t('accounts.share_code.share')}
          onPress={() => share(t('accounts.share_code.share_message', { code: shown.code })).catch(() => {})}
        />
        <Button
          variant="ghost"
          label={t('accounts.share_code.change')}
          onPress={() => setState({ ...shown, confirming: true, changeError: false })}
          disabledReason={online ? undefined : t('accounts.share_code.change_offline')}
        />
        <ConfirmSheet
          visible={shown.confirming}
          title={t('accounts.share_code.change_title')}
          message={t('accounts.share_code.change_message')}
          confirmLabel={t('accounts.share_code.change_confirm')}
          cancelLabel={t('accounts.share_code.change_cancel')}
          destructive
          onConfirm={change}
          onCancel={() => setState({ ...shown, confirming: false })}
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
