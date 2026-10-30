import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { spokenTime, type Hundredths } from '../../../core/time';
import { Icon, TimeValue } from '../../../core/ui';
import '../i18n';

export type ResultRowProps = {
  event: string;
  // Already formatted, e.g. "14 mar 2026"; empty when the date is malformed.
  date: string;
  competition: string | null;
  // A missing time is `null`: it reads "—", never zero.
  time: Hundredths | null;
  selected: boolean;
  onToggle: () => void;
};

// Presentational: one result the guardian can choose to import.
export function ResultRow({ event, date, competition, time, selected, onToggle }: ResultRowProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const label = [event, date, competition, time === null ? t('results_import.update.row.no_time_spoken') : spokenTime(time)].filter(Boolean).join(', ');

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={t(selected ? 'results_import.update.row.selected' : 'results_import.update.row.not_selected', { label })}
      onPress={onToggle}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: size['target-min'],
        padding: space[3],
        borderRadius: radius.md,
        backgroundColor: colors['surface-1'],
      }}
    >
      <Icon name={selected ? 'check_circle' : 'radio_button_unchecked'} color={selected ? 'ink' : 'ink-muted'} />
      <View style={{ flex: 1 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Text style={[typography['body-strong'], { color: colors.ink }]}>{event}</Text>
        <Text style={[typography.body, { color: colors['ink-muted'] }]}>{[date, competition].filter(Boolean).join(' · ')}</Text>
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <TimeValue value={time} size="time-sm" />
      </View>
    </Pressable>
  );
}
