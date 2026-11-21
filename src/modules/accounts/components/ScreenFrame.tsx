import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';

import { useTheme } from '../../../core/theme';

export type ScreenFrameProps = {
  // A frame whose step header already carries the heading has none of its own: one heading per screen.
  title?: string;
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
// The app draws edge to edge, so on Android the open keyboard no longer shrinks the window: the frame makes room for it itself, or the last fields stay under the keyboard and the scroll cannot reach them.
// 'padding' on both platforms: the padding is only the part of the keyboard that overlaps the frame, so a window the system did shrink gets none.
export function ScreenFrame({ title, large = false, subtitle, before, children, footer }: ScreenFrameProps) {
  const { colors, space, typography } = useTheme();

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: colors['surface-0'] }}
        contentContainerStyle={{ flexGrow: 1, padding: space[4], gap: space[4] }}
      >
        {before}
        {title ? (
          <Text accessibilityRole="header" style={[typography[large ? 'title-lg' : 'title'], { color: colors.ink }]}>
            {title}
          </Text>
        ) : null}
        {subtitle ? <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{subtitle}</Text> : null}
        {children}
        {footer ? (
          <>
            <View style={{ flex: 1 }} />
            {footer}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
