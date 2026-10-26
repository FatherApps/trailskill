import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { fontFamily, useTheme, type ColorToken } from '../theme';
import { unavailableColors } from './Button';
import { useFocusRing } from './focusRing';

export type InitialsDotProps = {
  initials: string;
  // The athlete's colour in the design system.
  color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';
};

export type ChipProps = {
  label: string;
  selected?: boolean;
  dot?: InitialsDotProps;
  // Not pressable, and said so to screen readers. Unchosen it turns the unavailable grey of Button; chosen it keeps its choice's black.
  disabled?: boolean;
  onPress: () => void;
};

export const chipColors: {
  background: ColorToken;
  border: ColorToken;
  text: ColorToken;
  selected: { background: ColorToken; border: ColorToken; text: ColorToken };
  dotText: ColorToken;
} = {
  background: 'surface-1',
  border: 'border',
  text: 'ink',
  selected: { background: 'primary', border: 'primary', text: 'on-primary' },
  dotText: 'on-color',
};

export function InitialsDot({ initials, color }: InitialsDotProps) {
  const { colors, space, radius, typography } = useTheme();
  // The OS text scale grows Text but is not in the theme tokens; the dot grows with it so the initials stay inside.
  const { fontScale } = useWindowDimensions();
  // 28 is the design-system dot size at 100 % (not a token).
  const dotSize = Math.max(28, Math.ceil(typography.caption.lineHeight * fontScale) + 2 * space[1]);

  return (
    <View
      style={{
        minWidth: dotSize,
        minHeight: dotSize,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
        backgroundColor: colors[color],
      }}
    >
      <Text style={[typography.caption, { fontFamily: fontFamily.sansSemiBold, fontWeight: '600', color: colors[chipColors.dotText] }]}>
        {initials}
      </Text>
    </View>
  );
}

// A chip is one option of a ChipRow, so it is a radio: the selected one is black (primary / on-primary).
export function Chip({ label, selected = false, dot, disabled = false, onPress }: ChipProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const palette = selected ? chipColors.selected : chipColors;
  const unavailable = disabled && !selected;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      // Android reads `checked` for radios, iOS reads `selected`.
      accessibilityState={{ checked: selected, selected }}
      // Pressable adds `disabled` to the state and stops the press; passing false would add `disabled: false` to every enabled chip.
      disabled={disabled || undefined}
      onPress={onPress}
      {...focusProps}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          minHeight: size['target-min'],
          paddingLeft: dot ? space[1] : space[3],
          paddingRight: space[3],
          borderRadius: radius.full,
          borderWidth: 1.5,
          borderColor: unavailable ? 'transparent' : colors[palette.border],
          backgroundColor: colors[unavailable ? unavailableColors.background : palette.background],
        },
        ring,
      ]}
    >
      {dot && (
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <InitialsDot {...dot} />
        </View>
      )}
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={[typography.label, { flexShrink: 1, color: colors[unavailable ? unavailableColors.text : palette.text] }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
