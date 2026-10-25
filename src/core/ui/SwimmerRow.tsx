import { Pressable, Text, View } from 'react-native';

import { t } from '../i18n';
import { useTheme, type ColorToken } from '../theme';
import { formatTime, type Hundredths } from '../time';
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
  tag,
  chevron = false,
  selected = false,
  onPress,
}: SwimmerRowProps) {
  const { colors, space, radius, typography } = useTheme();

  const label = [
    name,
    detail,
    bestTime === undefined
      ? null
      : bestTime === null
        ? t('swimmer_row.no_best_time')
        : t('swimmer_row.personal_best', { time: formatTime(bestTime) }),
    // The caption belongs to the best time, so without a best time it is not shown and not announced.
    bestTime === undefined ? null : bestTimeLabel,
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

  const content = (
    <>
      <View
        {...hidden}
        style={{
          minWidth: 40,
          minHeight: 40,
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
      </View>
      {bestTime !== undefined && (
        <View {...hidden} style={{ alignItems: 'flex-end' }}>
          <TimeValue value={bestTime} size="time-sm" />
          {bestTimeLabel ? (
            <Text style={[typography.caption, { color: colors[swimmerRowColors.detail] }]}>{bestTimeLabel}</Text>
          ) : null}
        </View>
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
