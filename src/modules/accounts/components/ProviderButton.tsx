import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { darken, radius, useTheme } from '../../../core/theme';
import { Icon } from '../../../core/ui';
import { t } from '../i18n';
import { googleMark, microsoftMark } from './providerMarks';

export type Provider = 'google' | 'microsoft';

export type ProviderButtonProps = {
  provider: Provider;
  onPress: () => void;
  // Present: the button cannot be used and says why in plain sight (for example without signal); never silently disabled.
  disabledReason?: string;
};

// Gap: the mark is 20 dp in the design reference; icon-md (22) is the closest token but would change an official mark's size.
const MARK = 20;
// Gap: the design reference has no Google button; the white disc Google's guidelines require is 28 dp, which no size token matches.
const DISC = 28;

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  mark: { width: MARK, height: MARK },
  disc: { width: DISC, height: DISC, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  label: { flexShrink: 1, textAlign: 'center' },
});

// Decorative: the label already says which provider this is.
const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

export function Mark({ provider }: { provider: Provider }) {
  if (provider === 'google') {
    return (
      <View testID="provider-mark-disc" style={[styles.disc, { backgroundColor: googleMark.background }]}>
        <Image source={googleMark.source} resizeMode="contain" style={styles.mark} />
      </View>
    );
  }
  return (
    <Svg width={MARK} height={MARK} viewBox={microsoftMark.viewBox}>
      {microsoftMark.squares.map((square) => (
        <Rect key={square.fill} {...square} width={microsoftMark.squareSize} height={microsoftMark.squareSize} />
      ))}
    </Svg>
  );
}

// A neutral pill with the provider's official mark: the main way in, with more weight than the code option.
export function ProviderButton({ provider, onPress, disabledReason }: ProviderButtonProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const [focused, setFocused] = useState(false);

  const label = t(`accounts.providers.${provider}`);
  const unavailable = disabledReason !== undefined;
  const background = unavailable ? colors['surface-2'] : colors['surface-1'];
  const text = colors[unavailable ? 'ink-muted' : 'ink'];
  // Unavailable: keep the provider in the name so two blocked buttons stay distinguishable.
  const name = unavailable ? `${label} · ${disabledReason}` : label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: size['target-min'],
          gap: space[3],
          // Gap: Button uses 22 horizontal padding; space-5 (20) is the closest token.
          paddingHorizontal: space[5],
          borderRadius: radius.full,
          backgroundColor: pressed && !unavailable ? darken(background, 0.08) : background,
          borderColor: unavailable ? 'transparent' : colors['border-strong'],
        },
        focused && { outlineColor: colors.focus, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' },
      ]}
    >
      {unavailable ? (
        <Icon name="lock" size="icon-sm" color="ink-muted" />
      ) : (
        <View {...hidden}>
          <Mark provider={provider} />
        </View>
      )}
      <Text style={[typography['body-strong'], styles.label, { color: text }]}>{name}</Text>
    </Pressable>
  );
}
