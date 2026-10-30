import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/ui';
import '../i18n';

export type OfficialUpdateButtonProps = {
  // While the source is being asked: a loading indicator, and a second press does nothing.
  checking: boolean;
  // Already formatted; null before the first update.
  lastUpdated: string | null;
  onPress: () => void;
};

// Presentational: whether it shows at all is decided by `updateButtonState`.
export function OfficialUpdateButton({ checking, lastUpdated, onPress }: OfficialUpdateButtonProps) {
  const { colors, space, typography } = useTheme();

  return (
    <View style={{ alignSelf: 'stretch', gap: space[1] }}>
      <Button
        variant="secondary"
        label={t('resultsImport.button.label')}
        loading={checking}
        loadingLabel={t('resultsImport.button.checking')}
        onPress={checking ? () => {} : onPress}
      />
      {lastUpdated !== null && (
        <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('resultsImport.button.last_updated', { date: lastUpdated })}</Text>
      )}
    </View>
  );
}
