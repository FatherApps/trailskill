import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import type { RecordSyncState } from '../../../core/sync';
import { useTheme } from '../../../core/theme';
import { formatTime, spokenTime, type Hundredths } from '../../../core/time';
import { Icon, SyncStatus } from '../../../core/ui';
import '../i18n';

export type ArrivalListProps = {
  // In arrival order; the list never sorts. Names are assigned later, so a row has none.
  // `syncState` is the arrival's own state; without it no pill is drawn. `clockTime` is the wall-clock time of the touch, for example "7:14:33".
  arrivals: { id: string; time: Hundredths; syncState?: RecordSyncState; clockTime?: string }[];
  // The swimmers in the water: the positions still to come are drawn as dashed "waiting" rows up to this number.
  total?: number;
};

// Each row is one accessible element: its parts are hidden from screen readers and the label says them all.
// The states that need the coach's attention stay visible on the row; "en el teléfono" is counted in the header instead (as in the design).
const needsAttention = (state: RecordSyncState | undefined) => state === 'not_sent' || state === 'needs_review';

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// The avatar-sized circle that carries a position. Layout size of the reference screen, not a token.
const DOT = 48;

export function ArrivalList({ arrivals, total = 0 }: ArrivalListProps) {
  const { colors, space, radius, typography } = useTheme();
  const waiting = Array.from({ length: Math.max(0, total - arrivals.length) }, (_, index) => arrivals.length + index + 1);

  if (arrivals.length === 0 && waiting.length === 0) return null;

  return (
    <View testID="arrival-list" style={{ gap: space[2] }}>
      {arrivals.map(({ id, time, syncState, clockTime }, index) => (
        <View
          key={id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            paddingVertical: space[3],
            paddingHorizontal: space[4],
            borderRadius: radius.md,
            backgroundColor: colors['surface-1'],
          }}
        >
          <View
            accessible
            accessibilityLabel={`${t('timing.series.arrival_label', { position: index + 1, time: spokenTime(time) })}${syncState ? `, ${t(`sync.${syncState}`)}` : ''}`}
            style={{ flex: 1, minHeight: DOT, justifyContent: 'center' }}
          >
            <View {...hidden} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ width: DOT, height: DOT, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.action }}>
                <Text style={[typography.title, { color: colors['on-action'] }]}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography['time-md'], { fontVariant: ['tabular-nums'], color: colors.ink }]}>{formatTime(time)}</Text>
                <Text style={[typography.caption, { color: colors['ink-muted'] }]}>
                  {clockTime ? t('timing.series.arrival_unassigned_at', { clock: clockTime }) : t('timing.series.arrival_unassigned')}
                </Text>
              </View>
            </View>
          </View>
          {/* The pill stays outside the accessible row, so it keeps its own reading. */}
          {needsAttention(syncState) && <SyncStatus state={syncState!} />}
          <Icon name="person_add" color="ink-muted" />
        </View>
      ))}
      {waiting.map((position) => (
        <View
          key={`waiting-${position}`}
          {...hidden}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            paddingVertical: space[3],
            paddingHorizontal: space[4],
            borderRadius: radius.md,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: colors['border-strong'],
          }}
        >
          <View style={{ width: DOT, height: DOT, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors['border-strong'] }}>
            <Text style={[typography.title, { color: colors['ink-muted'] }]}>{position}</Text>
          </View>
          <Text style={[typography['body-strong'], { color: colors['ink-muted'] }]}>{t('timing.series.waiting')}</Text>
        </View>
      ))}
    </View>
  );
}
