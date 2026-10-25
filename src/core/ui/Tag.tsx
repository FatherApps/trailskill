import { StyleSheet, Text, View } from 'react-native';

import { fontFamily, useTheme, type ColorToken } from '../theme';
import { Icon } from './Icon';
import type { IconName } from './icons';

export type TagVariant = 'neutral' | 'outline' | 'info' | 'ok' | 'warn';

export type TagProps = {
  label: string;
  variant?: TagVariant;
  icon?: IconName;
};

export const tagColors: Record<TagVariant, { background: ColorToken | null; text: ColorToken }> = {
  neutral: { background: 'surface-2', text: 'ink' },
  outline: { background: null, text: 'ink' },
  info: { background: 'primary-tint', text: 'on-primary-tint' },
  ok: { background: 'success-bg', text: 'success' },
  warn: { background: 'warning-bg', text: 'warning-text' },
};

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 24,
    paddingHorizontal: 10,
  },
});

export function Tag({ label, variant = 'neutral', icon }: TagProps) {
  const { colors, space, radius, typography } = useTheme();
  const { background, text } = tagColors[variant];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      accessibilityState={{}}
      style={[
        styles.tag,
        {
          gap: space[1],
          borderRadius: radius.full,
          backgroundColor: background ? colors[background] : 'transparent',
        },
        variant === 'outline' && {
          borderWidth: 1.5,
          borderColor: colors['border-strong'],
        },
      ]}
    >
      {icon && <Icon name={icon} size="icon-sm" color={text} />}
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={[
          typography.caption,
          {
            fontFamily: fontFamily.sansMedium,
            fontWeight: '500',
            color: colors[text],
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
