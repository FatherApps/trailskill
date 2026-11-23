import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { namedText, t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button } from '../../../core/ui';
import '../i18n';

export type RecoveryCodesScreenProps = {
  athleteName: string;
  // The permanent code. Left out when only a new set of recovery codes is shown.
  mainCode?: string;
  recoveryCodes: readonly string[];
  // The codes saved before no longer work: these replace them.
  replacing?: boolean;
  // The save is going on / failed: the owner can press «Ya los guardé» again.
  saving?: boolean;
  error?: boolean;
  onCopy: () => void;
  onDone: () => void;
};

// What «Copiar» hands to the share sheet: every text of this screen, one per line.
export function recoveryCodesText({ athleteName, mainCode, recoveryCodes }: Pick<RecoveryCodesScreenProps, 'athleteName' | 'mainCode' | 'recoveryCodes'>): string {
  return [
    namedText('athletes.recovery_codes.copy_message', athleteName),
    ...(mainCode ? [t('athletes.recovery_codes.copy_main', { code: mainCode })] : []),
    t('athletes.recovery_codes.copy_recovery'),
    ...recoveryCodes,
  ].join('\n');
}

// The one screen where the owner sees the codes: they are not shown again. The container decides when it goes away.
export function RecoveryCodesScreen({ athleteName, mainCode, recoveryCodes, replacing = false, saving = false, error = false, onCopy, onDone }: RecoveryCodesScreenProps) {
  const { colors, space, radius, typography } = useTheme();
  const code = (text: string) => (
    <Text key={text} selectable accessibilityLabel={t('athletes.recovery_codes.code_label', { code: text })} style={[typography['time-sm'], { color: colors.ink }]}>
      {text}
    </Text>
  );
  const card = { gap: space[2], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'], borderWidth: 1, borderColor: colors.border } as const;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[5] }}>
        <Text accessibilityRole="header" style={[typography['title-lg'], { color: colors.ink }]}>
          {namedText(mainCode ? 'athletes.recovery_codes.title' : 'athletes.recovery_codes.title_new_set', athleteName)}
        </Text>
        <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t(mainCode ? 'athletes.recovery_codes.intro' : 'athletes.recovery_codes.intro_new_set')}</Text>
        {replacing && (
          <Banner variant="warn" icon="error">
            {t('athletes.recovery_codes.replaced')}
          </Banner>
        )}
        {mainCode && (
          <View style={card}>
            <Text style={[typography['body-strong'], { color: colors.ink }]}>{t('athletes.recovery_codes.main_title')}</Text>
            {code(mainCode)}
            <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{namedText('athletes.recovery_codes.main_help', athleteName)}</Text>
          </View>
        )}
        <View style={card}>
          <Text style={[typography['body-strong'], { color: colors.ink }]}>{t('athletes.recovery_codes.recovery_title')}</Text>
          {recoveryCodes.map(code)}
          <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{t('athletes.recovery_codes.recovery_help')}</Text>
        </View>
        {error && (
          <Banner variant="warn" icon="error">
            {t('athletes.recovery_codes.error')}
          </Banner>
        )}
        <Button variant="secondary" label={t('athletes.recovery_codes.copy')} onPress={onCopy} />
        <Button
          variant="primary"
          label={t('athletes.recovery_codes.done')}
          loading={saving}
          loadingLabel={t('athletes.recovery_codes.saving')}
          onPress={onDone}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
