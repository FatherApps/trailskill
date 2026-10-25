import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { formatTime, spokenTime, type Hundredths } from '../../../core/time';
import '../i18n';

export type ArrivalListProps = {
  // In arrival order; the list never sorts. Names are assigned later, so a row has none.
  arrivals: { id: string; time: Hundredths }[];
};

// Each row is one accessible element: its parts are hidden from screen readers and the label says them all.
const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

export function ArrivalList({ arrivals }: ArrivalListProps) {
  const { colors, space, radius, size, typography } = useTheme();

  // The screen shows its empty state instead.
  if (arrivals.length === 0) return null;

  return (
    <View
      testID="arrival-list"
      style={{
        backgroundColor: colors['surface-1'],
        borderRadius: radius.md,
        overflow: 'hidden',
        paddingVertical: space[1],
      }}
    >
      {arrivals.map(({ id, time }, index) => (
        <View
          key={id}
          accessible
          accessibilityLabel={t('timing.series.arrival_label', { position: index + 1, time: spokenTime(time) })}
          style={{
            minHeight: size['target-min'],
            justifyContent: 'center',
            paddingVertical: space[3],
            paddingHorizontal: space[4],
            borderBottomWidth: index < arrivals.length - 1 ? 1 : 0,
            borderBottomColor: colors.border,
          }}
        >
          <View {...hidden} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
            <Text style={[typography['body-strong'], { color: colors.ink }]}>
              {t('timing.series.position', { position: index + 1 })}
            </Text>
            <Text style={[typography['time-md'], { fontVariant: ['tabular-nums'], color: colors.ink }]}>
              {formatTime(time)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
