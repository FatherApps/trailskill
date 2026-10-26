import { ScrollView, View } from 'react-native';

import { useTheme } from '../theme';
import { Chip, type InitialsDotProps } from './Chip';

export type ChipRowOption<T extends string> = { value: T; label: string; dot?: InitialsDotProps };

export type ChipRowProps<T extends string> = {
  options: ChipRowOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // Names the group for screen readers, for example "Deportista".
  accessibilityLabel: string;
};

// One row of chips where exactly one is chosen; when they do not fit, the row scrolls sideways.
export function ChipRow<T extends string>({ options, value, onChange, accessibilityLabel }: ChipRowProps<T>) {
  const { space } = useTheme();

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
        {options.map((option) => (
          <Chip key={option.value} label={option.label} dot={option.dot} selected={option.value === value} onPress={() => onChange(option.value)} />
        ))}
      </ScrollView>
    </View>
  );
}
