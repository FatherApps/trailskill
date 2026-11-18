import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { StateView } from '../../../core/ui';
import '../i18n';

// Presentational: blocks the app until it is updated. No way around it.
export function UpdateRequiredScreen({ onUpdate }: { onUpdate: () => void }) {
  const { colors, space } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: space[4], backgroundColor: colors['surface-1'] }}>
      <StateView
        kind="denied"
        icon="cloud_download"
        title={t('settings.versionGate.blocked.title')}
        message={t('settings.versionGate.blocked.message')}
        action={{ label: t('settings.versionGate.blocked.action'), onPress: onUpdate }}
      />
    </SafeAreaView>
  );
}
