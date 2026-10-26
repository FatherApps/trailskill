import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';

export type ScreenFrameProps = {
  title: string;
  // The display size of the lima boards, for the first screen of a flow.
  large?: boolean;
  // Only with an invitation: the school that invited.
  subtitle?: string;
  // Above the title, for example a back button.
  before?: ReactNode;
  children: ReactNode;
  // Main action, anchored to the bottom of the screen; with large text it scrolls after the content.
  footer?: ReactNode;
};

// Scrolls, so large text never clips; no text container has a fixed height.
export function ScreenFrame({ title, large = false, subtitle, before, children, footer }: ScreenFrameProps) {
  const { colors, space, typography } = useTheme();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors['surface-0'] }}
      contentContainerStyle={{ flexGrow: 1, padding: space[4], gap: space[4] }}
    >
      {before}
      <Text accessibilityRole="header" style={[typography[large ? 'title-lg' : 'title'], { color: colors.ink }]}>
        {title}
      </Text>
      {subtitle ? <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{subtitle}</Text> : null}
      {children}
      {footer ? (
        <>
          <View style={{ flex: 1 }} />
          {footer}
        </>
      ) : null}
    </ScrollView>
  );
}
