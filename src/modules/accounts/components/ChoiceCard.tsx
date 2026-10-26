import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, type ColorToken } from '../../../core/theme';
import { Icon, type IconName } from '../../../core/ui';

export type ChoiceCardProps = {
  title: string;
  detail: string;
  icon: IconName;
  // The card's color when chosen, a brand token of the design system.
  color: Extract<ColorToken, 'sky' | 'lilac' | 'coral' | 'lime'>;
  selected: boolean;
  // Large text: the cards are stacked, so each takes the full width instead of an equal share of the row.
  stacked?: boolean;
  onPress: () => void;
};

const styles = StyleSheet.create({
  // Border 2: the board's chosen card has a thicker outline than the 1.5 line of the others; 2 is the house value for emphasis.
  card: { borderWidth: 2 },
  // Equal share of the row.
  inRow: { flex: 1 },
});

// The card is one radio: its parts are hidden from screen readers and the label says both lines.
const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// A selectable card for side-by-side choices (LRegistroUsuario1): colored when chosen, the whole card is the touch target.
export function ChoiceCard({ title, detail, icon, color, selected, stacked = false, onPress }: ChoiceCardProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const text = colors[selected ? 'on-color' : 'ink'];

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${title}, ${detail}`}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.card,
        !stacked && styles.inRow,
        {
          padding: space[4],
          minHeight: size['target-min'],
          borderRadius: radius.md,
          borderColor: colors[selected ? 'primary' : 'border'],
          backgroundColor: colors[selected ? color : 'surface-1'],
        },
      ]}
    >
      <View {...hidden} style={{ gap: space[2] }}>
        <Icon name={icon} color={selected ? 'on-color' : 'ink'} />
        <Text style={[typography.subtitle, { color: text }]}>{title}</Text>
        <Text style={[typography.caption, { color: selected ? text : colors['ink-muted'] }]}>{detail}</Text>
      </View>
    </Pressable>
  );
}
