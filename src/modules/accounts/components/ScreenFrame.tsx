import type { ReactNode } from 'react';
import { ScrollView, Text } from 'react-native';

import { useTheme } from '../../../core/theme';

export type ScreenFrameProps = {
  title: string;
  // Only with an invitation: the school that invited.
  subtitle?: string;
  // Above the title, for example a back button.
  before?: ReactNode;
  children: ReactNode;
};

// Scrolls, so large text never clips; no text container has a fixed height.
export function ScreenFrame({ title, subtitle, before, children }: ScreenFrameProps) {
  const { colors, space, typography } = useTheme();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors['surface-0'] }}
      contentContainerStyle={{ padding: space[4], gap: space[4] }}
    >
      {before}
      <Text accessibilityRole="header" style={[typography['title-lg'], { color: colors.ink }]}>
        {title}
      </Text>
      {subtitle ? <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{subtitle}</Text> : null}
      {children}
    </ScrollView>
  );
}
