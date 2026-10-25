import { StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import type { RecordSyncState } from '../sync';
import { fontFamily, useTheme, type ColorToken } from '../theme';
import { Button } from './Button';

export type SyncStatusProps = {
  state: RecordSyncState;
  // Only emits the event: the upload retry itself belongs to src/core/sync.
  onRetry?: () => void;
};

export const syncStatusColors: Record<RecordSyncState, { background: ColorToken; text: ColorToken; dot: ColorToken }> =
  {
    on_device: { background: 'warning-bg', text: 'warning-text', dot: 'warning' },
    sending: { background: 'primary-tint', text: 'on-primary-tint', dot: 'on-primary-tint' },
    synced: { background: 'success-bg', text: 'success', dot: 'success' },
    not_sent: { background: 'danger-bg', text: 'danger-text', dot: 'danger-text' },
  };

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', minHeight: 28, paddingHorizontal: 10 },
  dot: { width: 8, height: 8 },
});

// Presentational: the caller derives `state` from each record's real outbox state, never from connectivity alone.
export function SyncStatus({ state, onRetry }: SyncStatusProps) {
  const { colors, space, radius, typography } = useTheme();
  const { background, text, dot } = syncStatusColors[state];
  const label = t(`sync.${state}`);

  return (
    <View testID="sync-status" accessibilityLiveRegion="polite" style={[styles.row, { gap: space[2] }]}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={label}
        style={[styles.pill, { gap: 6, borderRadius: radius.full, backgroundColor: colors[background] }]}
      >
        <View style={[styles.dot, { borderRadius: radius.full, backgroundColor: colors[dot] }]} />
        <Text
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={[typography.caption, { fontFamily: fontFamily.sansSemiBold, fontWeight: '600', color: colors[text] }]}
        >
          {label}
        </Text>
      </View>
      {state === 'not_sent' && onRetry && <Button variant="ghost" label={t('sync.retry')} onPress={onRetry} />}
    </View>
  );
}
