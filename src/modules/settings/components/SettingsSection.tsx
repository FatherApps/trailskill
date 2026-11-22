import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';

// One setting: its name, the control and the explanation under it.
export function SettingsSection({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  const { colors, space, typography } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <Text accessibilityRole="header" style={[typography.subtitle, { color: colors.ink }]}>
        {label}
      </Text>
      {children}
      <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{hint}</Text>
    </View>
  );
}
