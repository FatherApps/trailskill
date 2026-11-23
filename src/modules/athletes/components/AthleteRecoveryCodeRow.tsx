import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button } from '../../../core/ui';
import '../i18n';

export type AthleteRecoveryCodeRowProps = {
  // The permanent code kept on this phone: `null` when there is none, `undefined` while it is being read.
  code: string | null | undefined;
  revealed: boolean;
  // A new set of recovery codes comes from the server: without signal it is not offered.
  online: boolean;
  // Why the last attempt at a new set did not give one.
  problem?: 'unused' | 'error';
  onToggle: () => void;
  onCopy: () => void;
  onRegenerate: () => void;
};

// «Código de recuperación» of the owner on the swimmer's profile: the code shows only after a tap. No data here: the container reads it.
export function AthleteRecoveryCodeRow({ code, revealed, online, problem, onToggle, onCopy, onRegenerate }: AthleteRecoveryCodeRowProps) {
  const { colors, space, radius, typography } = useTheme();
  return (
    <View style={{ gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'], borderWidth: 1, borderColor: colors.border }}>
      <Text accessibilityRole="header" style={[typography['body-strong'], { color: colors.ink }]}>
        {t('athletes.recovery_code.title')}
      </Text>
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('athletes.recovery_code.help')}</Text>
      {revealed && code && (
        <Text selectable accessibilityLabel={t('athletes.recovery_code.code_label', { code })} style={[typography['time-sm'], { color: colors.ink }]}>
          {code}
        </Text>
      )}
      {revealed && code === null && <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('athletes.recovery_code.missing')}</Text>}
      <Button variant="secondary" label={t(revealed ? 'athletes.recovery_code.hide' : 'athletes.recovery_code.show')} onPress={onToggle} />
      {revealed && code && <Button variant="secondary" label={t('athletes.recovery_code.copy')} onPress={onCopy} />}
      {problem && (
        <Banner variant="warn" icon="error">
          {t(problem === 'unused' ? 'athletes.recovery_code.regenerate_unused' : 'athletes.recovery_code.regenerate_error')}
        </Banner>
      )}
      <Button
        variant="ghost"
        label={t('athletes.recovery_code.regenerate')}
        onPress={onRegenerate}
        disabledReason={online ? undefined : t('athletes.recovery_code.regenerate_offline')}
      />
    </View>
  );
}
