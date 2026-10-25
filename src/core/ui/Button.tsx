import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { darken, useTheme, type ColorToken } from '../theme';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'stop' | 'ghost';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'standard' | 'timing';
  icon?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  disabledReason?: string;
  accessibilityHint?: string;
};

export const buttonColors: Record<ButtonVariant, { background: ColorToken | null; text: ColorToken }> = {
  primary: { background: 'action', text: 'on-action' },
  dark: { background: 'primary', text: 'on-primary' },
  secondary: { background: 'surface-1', text: 'ink' },
  stop: { background: 'stop', text: 'on-stop' },
  ghost: { background: null, text: 'ink' },
};

export const unavailableColors: { background: ColorToken; text: ColorToken } = {
  background: 'surface-2',
  text: 'ink-muted',
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    paddingHorizontal: 22,
  },
  ghost: { paddingHorizontal: 12 },
  underline: { textDecorationLine: 'underline' },
});

export function Button({
  label,
  onPress,
  variant = 'primary',
  size: buttonSize = 'standard',
  icon,
  loading = false,
  loadingLabel,
  disabledReason,
  accessibilityHint,
}: ButtonProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const [focused, setFocused] = useState(false);

  const unavailable = disabledReason !== undefined;
  const timing = buttonSize === 'timing';
  const { background, text } = unavailable ? unavailableColors : buttonColors[variant];
  const ghost = !unavailable && background === null;

  const shownLabel = unavailable ? disabledReason : loading ? (loadingLabel ?? label) : label;
  const minHeight = timing && variant === 'stop' ? size['target-timing'] : timing ? 72 : size['target-min'];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabledReason ?? accessibilityHint}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      // Pressable only stops claiming touches (and RNTL only skips onPress) when `disabled` is set; it also reports disabled while loading.
      disabled={unavailable || loading}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.button,
        ghost && styles.ghost,
        {
          minHeight,
          gap: space[2],
          borderRadius: radius.full,
          backgroundColor: background
            ? pressed && !unavailable
              ? darken(colors[background], 0.08)
              : colors[background]
            : 'transparent',
          borderColor: variant === 'secondary' && !unavailable ? colors.border : 'transparent',
        },
        focused && {
          outlineColor: colors.focus,
          outlineWidth: 2,
          outlineOffset: 2,
          outlineStyle: 'solid',
        },
      ]}
    >
      {({ pressed }) => {
        // A button without background (ghost) darkens its text when pressed instead.
        const textColor = pressed && ghost ? darken(colors[text], 0.08) : colors[text];
        return (
          <>
            {loading ? (
              <ActivityIndicator size="small" color={textColor} />
            ) : unavailable ? (
              <Icon name="lock" size="icon-sm" color={text} />
            ) : (
              icon
            )}
            <Text
              // Android drops textDecorationLine when only the color of a mounted Text changes: remount it.
              key={textColor}
              style={[
                typography['body-strong'],
                timing && { fontSize: 18 },
                { color: textColor },
                ghost && styles.underline,
              ]}
            >
              {shownLabel}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}
