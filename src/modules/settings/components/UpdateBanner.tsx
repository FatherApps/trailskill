import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner, Button, IconButton } from '../../../core/ui';
import '../i18n';

// Presentational: a notice above the app that a newer version exists. The person can close it.
export function UpdateBanner({ onUpdate, onDismiss }: { onUpdate: () => void; onDismiss: () => void }) {
  const { space } = useTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ gap: space[2], padding: space[3] }}>
      <Banner variant="info">{t('settings.versionGate.banner.message')}</Banner>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button variant="secondary" label={t('settings.versionGate.banner.action')} onPress={onUpdate} />
        <IconButton icon="close" label={t('settings.versionGate.banner.dismiss')} onPress={onDismiss} />
      </View>
    </SafeAreaView>
  );
}
