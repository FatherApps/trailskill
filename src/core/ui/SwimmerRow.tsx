import type { ReactNode } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { t } from '../i18n';
import { useTheme, type ColorToken } from '../theme';
import { formatTime, personalBestDifference, spokenDifference, type Hundredths } from '../time';
import { Icon } from './Icon';
import { Tag, type TagProps } from './Tag';
import { TimeValue } from './TimeValue';

export type SwimmerRowProps = {
  name: string;
  initials: string;
  // The swimmer's colour in the design system; a swimmer keeps it everywhere.
  color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';
  // Category or group line.
  detail: string;
  // Present: the row shows the personal best, `null` meaning none yet ("—").
  bestTime?: Hundredths | null;
  // Caption under the personal best, for example "MP 50 L".
  bestTimeLabel?: string;
  // Status such as "se omitirá" or "por asignar".
  // A time that is not a personal best, for example a saved session time. When given, it wins over `bestTime`.
  time?: Hundredths | null;
  // Spoken prefix of `time` for screen readers, for example "Tiempo".
  timeLabel?: string;
  // Difference against this personal best under the name (only with a `time`); `newPersonalBest` adds the MP tag.
  personalBest?: Hundredths | null;
  newPersonalBest?: boolean;
  // Shown under the time (or the personal best) in the end column, for example a sync pill. Not part of the row label.
  status?: ReactNode;
  tag?: TagProps;
  chevron?: boolean;
  selected?: boolean;
  onPress?: () => void;
};

export const swimmerRowColors: {
  background: ColorToken;
  selectedBackground: ColorToken;
  name: ColorToken;
  detail: ColorToken;
  initials: ColorToken;
} = {
  background: 'surface-1',
  selectedBackground: 'primary-tint',
  name: 'ink',
  detail: 'ink-muted',
  initials: 'on-color',
};

// The row is one accessible element: its parts are hidden from screen readers and the label says them all.
const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

export function SwimmerRow({
  name,
  initials,
  color,
  detail,
  bestTime,
  bestTimeLabel,
  time,
  timeLabel,
  personalBest,
  newPersonalBest = false,
  status,
  tag,
  chevron = false,
  selected = false,
  onPress,
}: SwimmerRowProps) {
  const { colors, space, radius, typography } = useTheme();
  // The OS text scale grows Text but is not in the theme tokens; the avatar grows with it so the initials stay inside.
  const { fontScale } = useWindowDimensions();
  // 40 is the design-system avatar size at 100 % (not a token).
  const avatarSize = Math.max(40, Math.ceil(typography.label.lineHeight * fontScale) + 2 * space[2]);

  // `time` wins over `bestTime`: the row never shows two times on the right.
  const showBest = time === undefined && bestTime !== undefined;

  const spokenTime =
    time === undefined
      ? null
      : time === null
        ? t('swimmer_row.time_missing', { label: timeLabel ?? '' }).trim()
        : [timeLabel, formatTime(time)].filter(Boolean).join(' ');

  const difference = time === undefined ? null : personalBestDifference(time, personalBest);
  const showPbRow = time != null && (difference !== null || newPersonalBest);

  const label = [
    name,
    detail,
    spokenTime,
    difference !== null && spokenDifference(difference),
    showPbRow && newPersonalBest && t('time_value.pb_spoken'),
    !showBest || bestTime === undefined
      ? null
      : bestTime === null
        ? t('swimmer_row.no_best_time')
        : t('swimmer_row.personal_best', { time: formatTime(bestTime) }),
    // The caption belongs to the best time, so without a best time it is not shown and not announced.
    showBest ? bestTimeLabel : null,
    tag?.label,
  ]
    .filter(Boolean)
    .join(', ');

  const rowStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    // The whole row is the touch target, at least 64 (design-system README); 64 is not a token.
    minHeight: 64,
    backgroundColor: colors[selected ? swimmerRowColors.selectedBackground : swimmerRowColors.background],
  } as const;

  const lead = (
    <>
      <View
        {...hidden}
        style={{
          width: avatarSize,
          height: avatarSize,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.full,
          backgroundColor: colors[color],
        }}
      >
        <Text style={[typography.label, { color: colors[swimmerRowColors.initials] }]}>{initials}</Text>
      </View>
      <View {...hidden} style={{ flex: 1 }}>
        <Text style={[typography['body-strong'], { color: colors[swimmerRowColors.name] }]}>{name}</Text>
        <Text style={[typography.caption, { color: colors[swimmerRowColors.detail] }]}>{detail}</Text>
        {showPbRow && <TimeValue value={time} personalBest={personalBest} newPersonalBest={newPersonalBest} deltaOnly />}
      </View>
    </>
  );

  // With a status the end column is not hidden as a whole: only the time is, and the status stays its own element.
  const endColumn = (timeBlock: ReactNode) =>
    status ? (
      <View style={{ alignItems: 'flex-end' }}>
        <View {...hidden} style={{ alignItems: 'flex-end' }}>
          {timeBlock}
        </View>
        <View style={{ marginTop: space[1], alignItems: 'flex-end' }}>{status}</View>
      </View>
    ) : (
      <View {...hidden} style={{ alignItems: 'flex-end' }}>
        {timeBlock}
      </View>
    );

  const showTimeColumn = time !== undefined || showBest;

  const end = (
    <>
      {time !== undefined && endColumn(<TimeValue value={time} size="time-sm" />)}
      {/* time and best time are exclusive (showBest needs no time), so the status is drawn once in every case */}
      {!showTimeColumn && status && <View style={{ alignItems: 'flex-end' }}>{status}</View>}
      {showBest &&
        endColumn(
          <>
            <TimeValue value={bestTime} size="time-sm" />
            {bestTimeLabel ? (
              <Text style={[typography.caption, { color: colors[swimmerRowColors.detail] }]}>{bestTimeLabel}</Text>
            ) : null}
          </>,
        )}
      {tag && (
        <View {...hidden}>
          <Tag {...tag} />
        </View>
      )}
      {chevron && (
        <View {...hidden}>
          <Icon name="chevron_right" color={swimmerRowColors.detail} />
        </View>
      )}
    </>
  );

  // A status may hold a button, and an accessible element hides its children from iOS screen readers. So with a
  // status the single accessible element (and touch target) is only the avatar and text; the status sits beside it.
  if (status) {
    const group = { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3] } as const;
    return (
      <View style={rowStyle}>
        {onPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={onPress}
            style={group}
          >
            {lead}
          </Pressable>
        ) : (
          <View accessible accessibilityLabel={label} accessibilityState={{ selected }} style={group}>
            {lead}
          </View>
        )}
        {end}
      </View>
    );
  }

  const content = (
    <>
      {lead}
      {end}
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={rowStyle}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label} accessibilityState={{ selected }} style={rowStyle}>
      {content}
    </View>
  );
}
