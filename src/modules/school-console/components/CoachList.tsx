import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { useTheme } from '../../../core/theme';
import type { InitialsDotProps } from '../../../core/ui';
import '../i18n';
import { CoachCard } from './CoachCard';
import { LARGE_TEXT_SCALE, useTextScale } from './textScale';

// One coach of the school: groups and number of athletes, never contact or document data.
export type CoachRow = {
  id: string;
  // Full name; null while coach names are not readable (issue 220), shown as "Sin dato".
  name: string | null;
  initials: string;
  color: InitialsDotProps['color'];
  // A pending invitation is drawn with a dashed outline; there is no source of those yet, so a missing status is active.
  status?: 'active' | 'pending';
  groups: string[];
  athleteCount: number;
};

export type CoachListProps = {
  coaches: CoachRow[];
  // False (the default) until a coach can really be deactivated: the action is then shown disabled.
  deactivateAvailable?: boolean;
  // Only reports the press: the confirmation and the deactivation itself belong to the caller.
  onDeactivate: (id: string) => void;
};

// Narrowest list that holds two cards side by side at normal text size without squeezing the name; it is not a token.
const MIN_TWO_COLUMNS_WIDTH = 480;

// A grid of cards, two columns wide; with large text or a narrow list it is one column.
export function CoachList({ coaches, deactivateAvailable = false, onDeactivate }: CoachListProps) {
  const { space } = useTheme();
  const [width, setWidth] = useState<number | null>(null);
  const oneColumn = useTextScale() >= LARGE_TEXT_SCALE || (width !== null && width < MIN_TWO_COLUMNS_WIDTH);

  return (
    <View
      testID="coach-list"
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}
    >
      {coaches.map((coach) => (
        <CoachCard
          key={coach.id}
          coach={coach}
          basis={oneColumn ? '100%' : '48%'}
          deactivateAvailable={deactivateAvailable}
          onDeactivate={onDeactivate}
        />
      ))}
    </View>
  );
}
