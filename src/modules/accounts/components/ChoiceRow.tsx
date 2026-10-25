import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, type ColorToken } from '../../../core/theme';
import { Icon, type IconName } from '../../../core/ui';

export type ChoiceRowProps = {
  title: string;
  detail: string;
  icon: IconName;
  // The leading circle's color in the design system.
  color: Extract<ColorToken, 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4'>;
  selected: boolean;
  onPress: () => void;
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  circle: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
});

// The row is one radio: its parts are hidden from screen readers and the label says both lines.
const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// A selectable row (a SwimmerRow variant with a radio mark); the whole row is the touch target.
export function ChoiceRow({ title, detail, icon, color, selected, onPress }: ChoiceRowProps) {
  const { colors, space, radius, typography } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${title}, ${detail}`}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.row,
        {
          gap: space[3],
          paddingVertical: space[3],
          paddingHorizontal: space[4],
          // Gap: the row is at least 64 and its circle 40 (design-system README); neither is a token, so both stay literal.
          minHeight: 64,
          backgroundColor: colors[selected ? 'primary-tint' : 'surface-1'],
        },
      ]}
    >
      <View {...hidden} style={[styles.circle, { borderRadius: radius.full, backgroundColor: colors[color] }]}>
        <Icon name={icon} color="on-color" />
      </View>
      <View {...hidden} style={styles.text}>
        <Text style={[typography.subtitle, { color: colors.ink }]}>{title}</Text>
        <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{detail}</Text>
      </View>
      <View {...hidden}>
        <Icon name={selected ? 'radio_button_checked' : 'radio_button_unchecked'} />
      </View>
    </Pressable>
  );
}
