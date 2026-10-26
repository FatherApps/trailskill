import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { darken, useTheme } from '../../../core/theme';
import { formatTime, type Hundredths } from '../../../core/time';
import { Tag } from '../../../core/ui';
import '../i18n';

export type NameCardProps = {
  name: string;
  initials: string;
  // The athlete's colour in the design system; an athlete keeps it everywhere.
  color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';
  // Where the athlete was assigned; absent or null while not assigned.
  position?: number | null;
  // The athlete's personal best for the event, when known; nothing is shown otherwise, never a zero.
  bestTime?: Hundredths | null;
  onPress: () => void;
};

// Tall on purpose: coaches tap these with wet hands while the next series is already in the water. Layout size of the design.
const CARD_MIN_HEIGHT = 150;
// The initials circle of the design.
const AVATAR = 44;

// An athlete who can be given the open position, or, once given one, a quiet card that says where.
export function NameCard({ name, initials, color, position, bestTime, onPress }: NameCardProps) {
  const { colors, space, radius, typography } = useTheme();
  const assigned = position != null;
  const frame = { minHeight: CARD_MIN_HEIGHT, padding: space[4], borderRadius: radius.md, justifyContent: 'space-between' } as const;
  const avatar = (background: 'surface-1' | 'surface-0', text: 'on-color' | 'ink-muted') => (
    <View style={{ width: AVATAR, height: AVATAR, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors[background] }}>
      <Text style={[typography.label, { color: colors[text] }]}>{initials}</Text>
    </View>
  );

  if (assigned) {
    // Still a button: tapping it does nothing while another position holds the athlete, and the container says so.
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('timing.series.name_card_assigned', { name, position })}
        onPress={onPress}
        style={[frame, { backgroundColor: colors['surface-1'], borderWidth: 2, borderColor: colors.border }]}
      >
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {avatar('surface-0', 'ink-muted')}
          <Tag label={t('timing.series.position', { position })} />
        </View>
        <Text importantForAccessibility="no" accessibilityElementsHidden style={[typography['title-lg'], { color: colors['ink-muted'] }]}>
          {name}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('timing.series.name_card_assign', { name })}
      onPress={onPress}
      style={({ pressed }) => [frame, { backgroundColor: pressed ? darken(colors[color], 0.08) : colors[color] }]}
    >
      {avatar('surface-1', 'on-color')}
      <View>
        <Text style={[typography['title-lg'], { color: colors['on-color'] }]}>{name}</Text>
        {bestTime != null && (
          <Text style={[typography.caption, { color: colors['on-color'] }]}>{t('timing.stopwatch.personal_best', { time: formatTime(bestTime) })}</Text>
        )}
      </View>
    </Pressable>
  );
}
