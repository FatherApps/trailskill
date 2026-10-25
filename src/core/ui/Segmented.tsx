import { Pressable, Text, View } from 'react-native';

import { useTheme, type ColorToken } from '../theme';

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // Names the group for screen readers, for example "Estilo".
  accessibilityLabel: string;
};

// There is no disabled state: an option that does not apply is removed, not shown disabled (design-system README).
export const segmentedColors: {
  track: ColorToken;
  unselected: ColorToken;
  selected: { background: ColorToken; text: ColorToken };
} = {
  track: 'surface-1',
  unselected: 'ink',
  selected: { background: 'primary', text: 'on-primary' },
};

export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedProps<T>) {
  const { colors, space, radius, size, typography } = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        padding: space[1],
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: radius.full,
        backgroundColor: colors[segmentedColors.track],
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const { background, text } = segmentedColors.selected;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            // Android reads `checked` for radios, iOS reads `selected`.
            accessibilityState={{ checked: selected, selected }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: size['target-min'],
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: space[3],
              borderRadius: radius.full,
              backgroundColor: selected ? colors[background] : 'transparent',
            }}
          >
            <Text
              style={[
                typography.label,
                { textAlign: 'center', color: colors[selected ? text : segmentedColors.unselected] },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
