import { StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import type { RecordSyncState } from '../sync';
import { fontFamily, useTheme, type ColorToken } from '../theme';
import { Button } from './Button';

export type SyncStatusProps = {
  state: RecordSyncState;
  // Global pill in the top bar: how many records are in this state, drawn as "<label> · N".
  count?: number;
  // Only emits the event: the upload retry itself belongs to src/core/sync.
  onRetry?: () => void;
  // Informative line under the pill (not an error), e.g. why a retry sent nothing.
  message?: string;
};

type SyncStatusColors = { background: ColorToken; text: ColorToken; dot: ColorToken; border?: ColorToken };

export const syncStatusColors: Record<RecordSyncState, SyncStatusColors> =
  {
    on_device: { background: 'warning-bg', text: 'warning-text', dot: 'warning' },
    sending: { background: 'primary-tint', text: 'on-primary-tint', dot: 'on-primary-tint' },
    synced: { background: 'success-bg', text: 'success', dot: 'success' },
    not_sent: { background: 'danger-bg', text: 'danger-text', dot: 'danger-text' },
    // Like on_device but outlined, so a conflict is told apart from a pending write.
    needs_review: { background: 'warning-bg', text: 'warning-text', dot: 'warning-text', border: 'warning-text' },
  };

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', minHeight: 28, paddingHorizontal: 10 },
  dot: { width: 8, height: 8 },
});

// Presentational: the caller derives `state` from each record's real outbox state, never from connectivity alone.
export function SyncStatus({ state, count, onRetry, message }: SyncStatusProps) {
  const { colors, space, radius, typography } = useTheme();
  const { background, text, dot, border } = syncStatusColors[state];
  const label = count === undefined ? t(`sync.${state}`) : `${t(`sync.${state}`)} · ${count}`;

  return (
    <View testID="sync-status" accessibilityLiveRegion="polite" style={{ gap: space[1] }}>
      <View style={[styles.row, { gap: space[2] }]}>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={label}
          style={[
            styles.pill,
            { gap: 6, borderRadius: radius.full, backgroundColor: colors[background] },
            border && { borderWidth: 1.5, borderColor: colors[border] },
          ]}
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
      {message ? <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{message}</Text> : null}
    </View>
  );
}
