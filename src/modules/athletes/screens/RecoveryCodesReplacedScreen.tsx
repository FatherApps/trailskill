import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { namedText, t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button } from '../../../core/ui';
import '../i18n';

export type RecoveryCodesReplacedScreenProps = {
  athleteName: string;
  onDone: () => void;
};

// The owner pressed «Ya los guardé» (or opened the app) holding a set that another device or account replaced and already confirmed:
// the texts they wrote down no longer work and the current ones are not here. Never a silent close.
export function RecoveryCodesReplacedScreen({ athleteName, onDone }: RecoveryCodesReplacedScreenProps) {
  const { colors, space, typography } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[5] }}>
        <Text accessibilityRole="header" style={[typography['title-lg'], { color: colors.ink }]}>
          {t('athletes.recovery_codes.replaced_elsewhere_title')}
        </Text>
        <Text style={[typography.body, { color: colors['ink-muted'] }]}>{namedText('athletes.recovery_codes.copy_message', athleteName)}</Text>
        <Banner variant="warn" icon="error">
          {t('athletes.recovery_codes.replaced_elsewhere_message')}
        </Banner>
        <Button variant="primary" label={t('athletes.recovery_codes.replaced_elsewhere_done')} onPress={onDone} />
      </ScrollView>
    </SafeAreaView>
  );
}
