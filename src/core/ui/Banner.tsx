import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme, type ColorToken } from '../theme';
import { Icon } from './Icon';
import type { IconName } from './icons';

export type BannerVariant = 'info' | 'warn' | 'success';

export type BannerProps = {
  variant: BannerVariant;
  // Decorative: the text carries the meaning. Without it the text takes the full width.
  icon?: IconName;
  // The text; nest <Text> inside for emphasis (e.g. a school name).
  children: ReactNode;
};

export const bannerColors: Record<BannerVariant, { background: ColorToken; icon: ColorToken; text: ColorToken }> = {
  info: { background: 'primary-tint', icon: 'ink', text: 'ink' },
  warn: { background: 'warning-bg', icon: 'warning-text', text: 'ink' },
  success: { background: 'success-bg', icon: 'success', text: 'ink' },
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  text: { flex: 1 },
});

// Presentational: a short notice inside a screen. Only warn is announced, so being offline is heard.
export function Banner({ variant, icon, children }: BannerProps) {
  const { colors, space, radius, typography } = useTheme();
  const tokens = bannerColors[variant];

  return (
    <View
      testID="banner"
      accessibilityLiveRegion={variant === 'warn' ? 'polite' : undefined}
      style={[
        styles.row,
        {
          gap: space[3],
          // Gap: the design system uses 14 vertical padding and 15/22 text; closest tokens are space-3 (12) and body (16/24).
          paddingVertical: space[3],
          paddingHorizontal: space[4],
          borderRadius: radius.md,
          backgroundColor: colors[tokens.background],
        },
      ]}
    >
      {icon && <Icon name={icon} color={tokens.icon} />}
      <Text style={[typography.body, styles.text, { color: colors[tokens.text] }]}>{children}</Text>
    </View>
  );
}
