import { Text } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Banner } from '../../../core/ui';
import '../i18n';

// Offline never blocks timing: times are saved on the phone and sent later.
export function OfflineBanner() {
  const { typography } = useTheme();

  return (
    <Banner variant="warn" icon="wifi_off">
      <Text style={typography['body-strong']}>{t('timing.offline.title')}</Text> {t('timing.offline.message')}
    </Banner>
  );
}
