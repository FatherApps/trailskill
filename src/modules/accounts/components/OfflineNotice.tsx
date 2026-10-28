import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Icon } from '../../../core/ui';

// A white status card with the wifi_off icon. Only this screen uses it, so it stays here until a second module needs it.
// Announced politely, like the warn Banner it replaces, and never a button.
export function OfflineNotice({ children }: { children: ReactNode }) {
  const { colors, space, radius, typography } = useTheme();

  return (
    <View
      testID="offline-notice"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[3],
        paddingVertical: space[3],
        paddingHorizontal: space[4],
        borderRadius: radius.md,
        backgroundColor: colors['surface-1'],
      }}
    >
      <View testID="offline-notice-icon">
        <Icon name="wifi_off" />
      </View>
      <Text style={[typography.body, { flex: 1, color: colors.ink }]}>{children}</Text>
    </View>
  );
}
