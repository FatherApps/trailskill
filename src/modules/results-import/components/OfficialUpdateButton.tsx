import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/ui';
import '../i18n';

export type OfficialUpdateButtonProps = {
  // While the source is being asked: a loading indicator, and a second press does nothing.
  checking: boolean;
  // The server limited the last check and the countdown is still running: pressing does nothing yet.
  waiting?: boolean;
  // Already formatted; null before the first update.
  lastUpdated: string | null;
  onPress: () => void;
};

// Presentational: whether it shows at all is decided by `updateButtonState`.
export function OfficialUpdateButton({ checking, waiting = false, lastUpdated, onPress }: OfficialUpdateButtonProps) {
  const { colors, space, typography } = useTheme();

  return (
    <View style={{ alignSelf: 'stretch', gap: space[1] }}>
      <Button
        variant="secondary"
        label={t('results_import.update.button.label')}
        loading={checking}
        loadingLabel={t('results_import.update.button.checking')}
        disabledReason={waiting ? t('results_import.update.button.waiting') : undefined}
        onPress={checking ? () => {} : onPress}
      />
      {lastUpdated !== null && (
        <Text style={[typography.body, { color: colors['ink-muted'] }]}>{t('results_import.update.button.last_updated', { date: lastUpdated })}</Text>
      )}
    </View>
  );
}
