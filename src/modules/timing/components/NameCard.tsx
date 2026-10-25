import { Pressable, Text } from 'react-native';

import { t } from '../../../core/i18n';
import { darken, useTheme } from '../../../core/theme';
import '../i18n';

export type NameCardProps = {
  name: string;
  // The athlete's colour in the design system; an athlete keeps it everywhere.
  color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';
  // Where the athlete was assigned; absent or null while not assigned.
  position?: number | null;
  onPress: () => void;
};

// Tall on purpose: coaches tap these with wet hands while the next series is already in the water.
const CARD_MIN_HEIGHT = 72;

export function NameCard({ name, color, position, onPress }: NameCardProps) {
  const { colors, space, radius, typography } = useTheme();
  const assigned = position != null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        assigned
          ? t('timing.series.name_card_assigned', { name, position })
          : t('timing.series.name_card_assign', { name })
      }
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space[3],
        minHeight: CARD_MIN_HEIGHT,
        paddingVertical: space[3],
        paddingHorizontal: space[4],
        borderRadius: radius.md,
        backgroundColor: pressed ? darken(colors[color], 0.08) : colors[color],
      })}
    >
      <Text style={[typography.title, { flexShrink: 1, color: colors['on-color'] }]}>{name}</Text>
      {assigned && (
        <Text style={[typography['body-strong'], { color: colors['on-color'] }]}>
          {t('timing.series.position', { position })}
        </Text>
      )}
    </Pressable>
  );
}
