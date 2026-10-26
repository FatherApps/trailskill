import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Button, SwimmerRow, type SwimmerRowProps } from '../../../core/ui';
import '../i18n';
import { LARGE_TEXT_SCALE, useTextScale } from './textScale';

// One coach of the school: groups and number of athletes, never contact or document data.
export type CoachRow = {
  id: string;
  // Full name; null while coach names are not readable (issue 220), shown as "Sin dato".
  name: string | null;
  initials: string;
  color: SwimmerRowProps['color'];
  groups: string[];
  athleteCount: number;
};

export type CoachListProps = {
  coaches: CoachRow[];
  // Only reports the press: the confirmation and the deactivation itself belong to the caller.
  onDeactivate: (id: string) => void;
};

export const coachListColors: { background: ColorToken; divider: ColorToken; caption: ColorToken } = {
  background: 'surface-1',
  divider: 'border',
  caption: 'ink-muted',
};

// Narrowest list that holds the row and its action side by side at normal text size without squeezing the name; it is
// not a token.
const MIN_INLINE_WIDTH = 480;

// A list of SwimmerRow (the design system's row for a person) with the deactivate action beside each one.
export function CoachList({ coaches, onDeactivate }: CoachListProps) {
  const { colors, space, radius } = useTheme();
  const noData = t('schoolConsole.common.no_data');
  const [width, setWidth] = useState<number | null>(null);
  // Large text or a narrow list: the action goes below the row instead of squeezing the name.
  const stacked = useTextScale() >= LARGE_TEXT_SCALE || (width !== null && width < MIN_INLINE_WIDTH);

  return (
    <View
      testID="coach-list"
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={{ borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors[coachListColors.background] }}
    >
      {coaches.map((coach, index) => (
        <View
          key={coach.id}
          testID="coach-row"
          style={[
            { flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'stretch' : 'center', paddingRight: stacked ? 0 : space[3] },
            stacked && { paddingBottom: space[3], paddingHorizontal: space[3] },
            index < coaches.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors[coachListColors.divider] },
          ]}
        >
          <View style={{ flex: stacked ? undefined : 1 }}>
            <SwimmerRow
              name={coach.name ?? noData}
              initials={coach.initials}
              color={coach.color}
              detail={coach.groups.length > 0 ? coach.groups.join(' · ') : t('schoolConsole.coaches.no_groups')}
              tag={{ label: t('schoolConsole.coaches.athletes', { count: coach.athleteCount }), variant: 'neutral' }}
            />
          </View>
          <View style={stacked ? { alignItems: 'flex-start' } : undefined}>
            <Button
              variant="ghost"
              label={t('schoolConsole.coaches.deactivate')}
              accessibilityHint={t('schoolConsole.coaches.deactivate_hint', { name: coach.name ?? noData })}
              onPress={() => onDeactivate(coach.id)}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
