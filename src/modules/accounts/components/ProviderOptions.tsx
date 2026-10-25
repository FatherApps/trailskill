import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { t } from '../i18n';
import { ProviderButton } from './ProviderButton';

export type ProviderOptionsProps = {
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
export function ProviderOptions({ offline = false, onGoogle, onMicrosoft }: ProviderOptionsProps) {
  const { colors, space, typography } = useTheme();
  const disabledReason = offline ? t('accounts.offline.reason') : undefined;

  return (
    <View style={{ gap: space[3] }}>
      <ProviderButton provider="google" disabledReason={disabledReason} onPress={onGoogle} />
      <ProviderButton provider="microsoft" disabledReason={disabledReason} onPress={onMicrosoft} />
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
