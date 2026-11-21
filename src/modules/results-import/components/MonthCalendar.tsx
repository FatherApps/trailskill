import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { monthGrid, type CalendarMonth } from '../data/tournamentCalendar';
import { dayLabel, monthTitle } from './tournamentDates';

export type MonthCalendarProps = {
  month: CalendarMonth;
  // Tournaments of each day by `YYYYMMDD`; a day without an entry has none and shows no dot.
  counts: Record<string, number>;
  selected: string | null;
  onSelect: (dateKey: string) => void;
  onPrevious: () => void;
  onNext: () => void;
};

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

// Pending design: the design system has no calendar. It is built only from theme tokens and the 48 dp touch target.
export function MonthCalendar({ month, counts, selected, onSelect, onPrevious, onNext }: MonthCalendarProps) {
  const { colors, radius, size, space, typography } = useTheme();
  const arrow = (glyph: string, label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: size['target-min'], height: size['target-min'], alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={[typography.title, { color: colors.ink }]}>{glyph}</Text>
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: colors['surface-1'], borderWidth: 1, borderColor: colors['border-strong'], padding: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {arrow('‹', t('results_import.tournament.calendar.previous'), onPrevious)}
        <Text accessibilityRole="header" style={[typography['body-strong'], { color: colors.ink }]}>
          {monthTitle(month.year, month.month)}
        </Text>
        {arrow('›', t('results_import.tournament.calendar.next'), onNext)}
      </View>
      <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {WEEKDAYS.map((weekday) => (
          <Text key={weekday} style={[typography.caption, { flex: 1, textAlign: 'center', color: colors['ink-muted'] }]}>
            {t(`results_import.tournament.calendar.weekdays.${weekday}`)}
          </Text>
        ))}
      </View>
      {monthGrid(month.year, month.month).map((week, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {week.map((dateKey, column) => {
            if (!dateKey) return <View key={column} style={{ flex: 1, height: size['target-min'] }} />;
            const count = counts[dateKey] ?? 0;
            const chosen = dateKey === selected;
            return (
              <Pressable
                key={column}
                accessibilityRole="button"
                accessibilityLabel={dayLabel(dateKey, count)}
                accessibilityState={{ selected: chosen }}
                onPress={() => onSelect(dateKey)}
                style={{
                  flex: 1,
                  height: size['target-min'],
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.sm,
                  backgroundColor: chosen ? colors.primary : 'transparent',
                }}
              >
                <Text style={[typography.body, { color: chosen ? colors['on-primary'] : colors.ink }]}>{Number(dateKey.slice(6, 8))}</Text>
                <View
                  testID={count > 0 ? `day-dot-${dateKey}` : undefined}
                  style={{
                    width: space[1],
                    height: space[1],
                    borderRadius: radius.full,
                    backgroundColor: count > 0 ? (chosen ? colors['on-primary'] : colors.primary) : 'transparent',
                  }}
                />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
