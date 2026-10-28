import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { t } from '../i18n';
import { ProviderButton, type Provider } from './ProviderButton';

export type ProviderOptionsProps = {
  // Which buttons show, in this fixed order; none shown, nothing rendered (not even the divider).
  providers?: readonly Provider[];
  offline?: boolean;
  onGoogle: () => void;
  onMicrosoft: () => void;
};

const styles = StyleSheet.create({
  divider: { flexDirection: 'row', alignItems: 'center' },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  text: { flexShrink: 1, textAlign: 'center' },
});

// The main way in, always before the code option; the divider announces the lighter alternative.
export function ProviderOptions({ providers = ['google', 'microsoft'], offline = false, onGoogle, onMicrosoft }: ProviderOptionsProps) {
  const { colors, space, typography } = useTheme();
  const disabledReason = offline ? t('accounts.offline.reason') : undefined;
  if (providers.length === 0) return null;

  return (
    <View style={{ gap: space[3] }}>
      {providers.includes('google') && <ProviderButton provider="google" disabledReason={disabledReason} onPress={onGoogle} />}
      {providers.includes('microsoft') && <ProviderButton provider="microsoft" disabledReason={disabledReason} onPress={onMicrosoft} />}
      <View style={[styles.divider, { gap: space[3] }]}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <Text style={[typography.caption, styles.text, { color: colors['ink-muted'] }]}>
          {t('accounts.providers.divider')}
        </Text>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>
    </View>
  );
}
