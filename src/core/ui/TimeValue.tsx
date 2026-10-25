import { StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import { fontFamily, useTheme } from '../theme';
import { formatTime, personalBestDifference, spokenDifference, spokenTime, type Hundredths } from '../time';
import { Icon } from './Icon';
import { Tag } from './Tag';

export type TimeValueProps = {
  // A missing time is `null`: formatTime shows "—", never "0,00".
  value: Hundredths | null;
  size?: 'time-lg' | 'time-md' | 'time-sm';
  // Passed to formatTime; the component defines no separator of its own.
  decimalSeparator?: ',' | '.';
  // The result was completed without a time (only with `value` null): "Completado" instead of "—".
  completed?: boolean;
  // Shows the difference against this personal best; nothing when equal, absent or `value` is missing.
  personalBest?: Hundredths | null;
  // Marks `value` as a new personal best with the "MP" tag.
  newPersonalBest?: boolean;
  // Draws only the tag and the difference, for a layout that prints the time elsewhere (for example a large clock).
  deltaOnly?: boolean;
};

// The row's label already says everything its children show.
const hiddenFromReaders = {
  importantForAccessibility: 'no-hide-descendants',
  accessibilityElementsHidden: true,
} as const;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  delta: { flexDirection: 'row', alignItems: 'center' },
});

export function TimeValue({
  value,
  size = 'time-md',
  decimalSeparator,
  completed = false,
  personalBest,
  newPersonalBest = false,
  deltaOnly = false,
}: TimeValueProps) {
  const { colors, space, typography } = useTheme();

  const isCompleted = value === null && completed;
  const showPb = value !== null && newPersonalBest;
  const difference = personalBestDifference(value, personalBest);
  const faster = difference !== null && difference < 0;

  const spoken = [
    deltaOnly
      ? null
      : value === null
        ? t(isCompleted ? 'time_value.completed_spoken' : 'time_value.not_recorded')
        : spokenTime(value),
    difference !== null && spokenDifference(difference),
    showPb && t('time_value.pb_spoken'),
  ]
    .filter(Boolean)
    .join('. ');

  const timeStyle = [
    typography[size],
    {
      fontVariant: ['tabular-nums'] as const,
      color: colors[value === null ? 'ink-muted' : 'ink'],
    },
  ];

  if (deltaOnly && difference === null && !showPb) return null;

  if (!deltaOnly && !isCompleted && difference === null && !showPb) {
    return (
      <Text accessibilityLabel={spoken} style={timeStyle}>
        {formatTime(value, { decimalSeparator })}
      </Text>
    );
  }

  const deltaColor = faster ? 'success' : 'ink-muted';

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={spoken} style={[styles.row, { gap: space[3] }]}>
      {deltaOnly ? null : isCompleted ? (
        // The README text says ink-muted for "Completado"; its preview draws the outline tag, which is what is used.
        <View {...hiddenFromReaders}>
          <Tag variant="outline" icon="check" label={t('time_value.completed')} />
        </View>
      ) : (
        <Text {...hiddenFromReaders} style={timeStyle}>
          {formatTime(value, { decimalSeparator })}
        </Text>
      )}
      {showPb && (
        <View {...hiddenFromReaders}>
          <Tag variant="ok" label={t('time_value.pb_tag')} />
        </View>
      )}
      {difference !== null && (
        <View {...hiddenFromReaders} style={[styles.delta, { gap: space[1] }]}>
          <Icon name={faster ? 'arrow_upward' : 'arrow_downward'} size="icon-sm" color={deltaColor} />
          <Text
            style={[
              // No mono caption token exists: this is caption (13px) in the mono semibold of the time tokens.
              typography.caption,
              {
                fontFamily: fontFamily.monoSemiBold,
                fontWeight: '600',
                fontVariant: ['tabular-nums'],
                color: colors[deltaColor],
              },
            ]}
          >
            {`${faster ? '−' : '+'}${formatTime(Math.abs(difference), { decimalSeparator })} ${t('time_value.vs_pb')}`}
          </Text>
        </View>
      )}
    </View>
  );
}
