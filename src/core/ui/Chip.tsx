import type { ReactNode } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { useTheme, type ColorToken } from '../theme';
import { AthleteAvatar } from './AthleteAvatar';
import { unavailableColors } from './Button';
import { useFocusRing } from './focusRing';

export type InitialsDotProps = {
  initials: string;
  // The athlete's colour in the design system.
  color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';
  // The athlete's `sm` AthleteAvatar with their photo; absent: the initials.
  avatar?: ReactNode;
};

export type ChipProps = {
  label: string;
  // What screen readers say when it differs from the visible label, for example "Libre 50 metros" under a chip that shows "Libre 50".
  accessibilityLabel?: string;
  selected?: boolean;
  dot?: InitialsDotProps;
  // Not pressable, and said so to screen readers. Unchosen it turns the unavailable grey of Button; chosen it keeps its choice's black.
  disabled?: boolean;
  onPress: () => void;
  // Lets a ChipRow know where the chip is, so it can bring the chosen one into view.
  onLayout?: (event: LayoutChangeEvent) => void;
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

// The swimmer's circle in a chip, a table cell or a card: an AthleteAvatar `sm`. `avatar` is that same avatar with the athlete's photo
// (built by a container that can read the photo, see AthleteAvatarSlot); without it the initials show.
export function InitialsDot({ initials, color, avatar }: InitialsDotProps) {
  return avatar ?? <AthleteAvatar initials={initials} colorIndex={Number(color.slice(-1)) as 1 | 2 | 3 | 4} size="sm" authorized={false} />;
}

// A chip is one option of a ChipRow, so it is a radio: the selected one is black (primary / on-primary).
export function Chip({ label, accessibilityLabel, selected = false, dot, disabled = false, onPress, onLayout }: ChipProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const palette = selected ? chipColors.selected : chipColors;
  const unavailable = disabled && !selected;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      // Android reads `checked` for radios, iOS reads `selected`.
      accessibilityState={{ checked: selected, selected }}
      // Pressable adds `disabled` to the state and stops the press; passing false would add `disabled: false` to every enabled chip.
      disabled={disabled || undefined}
      onPress={onPress}
      onLayout={onLayout}
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
