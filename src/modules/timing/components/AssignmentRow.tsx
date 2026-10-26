import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import type { RecordSyncState } from '../../../core/sync';
import { useTheme } from '../../../core/theme';
import { formatTime, type Hundredths } from '../../../core/time';
import { Tag } from '../../../core/ui';
import '../i18n';

export type AssignmentRowProps = {
  position: number;
  // Null for an arrival saved without a time: shown as "—", never as zero.
  time: Hundredths | null;
  athlete?: { shortName: string; initials: string; color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4'; bestTime?: Hundredths | null };
  // The arrival's own sync state: not drawn here (the header counts them) but read out with the row.
  syncState?: RecordSyncState;
  // The position the next card goes to.
  highlighted?: boolean;
  // Opens an assigned position again.
  onPress?: () => void;
};

// Layout sizes of the design (LSerieAsignar), not tokens.
const DOT = 44;
const CHIP_HEIGHT = 40;

// One position of the series: its place, its time and, once given, the athlete.
export function AssignmentRow({ position, time, athlete, syncState, highlighted = false, onPress }: AssignmentRowProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const dark = highlighted;
  const personalBest = athlete?.bestTime != null && time !== null && time <= athlete.bestTime;
  const place = t('timing.series.position_n', { position });
  const label = [
    athlete ? `${athlete.shortName}, ${place}` : `${place}, ${t('timing.series.not_assigned')}`,
    time === null ? undefined : formatTime(time),
    syncState && t(`sync.${syncState}`),
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[3],
        paddingHorizontal: space[4],
        borderRadius: radius.md,
        backgroundColor: dark ? colors.header : colors['surface-1'],
        ...(dark && { borderWidth: 4, borderColor: colors.action }),
      }}
    >
      <View
        style={{
          width: DOT,
          height: DOT,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: athlete || dark ? colors.action : colors['surface-0'],
        }}
      >
        <Text style={[typography['body-strong'], { color: colors['on-action'] }]}>{position}</Text>
      </View>
      <Text style={[typography['time-md'], { fontVariant: ['tabular-nums'], color: dark ? colors['on-header'] : colors.ink }]}>
        {time === null ? '—' : formatTime(time)}
      </Text>
      {athlete ? (
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            minHeight: CHIP_HEIGHT,
            paddingLeft: space[1],
            paddingRight: space[3],
            borderRadius: radius.full,
            backgroundColor: colors[athlete.color],
          }}
        >
          <View style={{ width: 28, height: 28, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-1'] }}>
            <Text style={[typography.caption, { color: colors['on-color'] }]}>{athlete.initials}</Text>
          </View>
          <Text style={[typography.label, { flexShrink: 1, color: colors['on-color'] }]}>
            {athlete.shortName}
          </Text>
        </View>
      ) : (
        <Text style={[typography[dark ? 'body-strong' : 'body'], { flex: 1, color: dark ? colors.action : colors['ink-muted'] }]}>
          {dark ? t('timing.series.pick_name') : t('timing.series.not_assigned')}
        </Text>
      )}
      {personalBest && (
        <View>
          <Tag variant="ok" label={t('timing.series.personal_best_tag')} />
        </View>
      )}
    </View>
  );

  return onPress && athlete ? (
    <Pressable testID={`position-row-${position}`} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: highlighted }} onPress={onPress} style={{ minHeight: size['target-min'] }}>
      {content}
    </Pressable>
  ) : (
    <View testID={`position-row-${position}`} accessible accessibilityLabel={label} accessibilityState={{ selected: highlighted }}>
      {content}
    </View>
  );
}
