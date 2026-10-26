import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { useTheme } from '../../../core/theme';
import type { InitialsDotProps } from '../../../core/ui';
import '../i18n';
import { CoachCard } from './CoachCard';
import { twoColumnWidth } from './coachGrid';
import { LARGE_TEXT_SCALE, useTextScale } from './textScale';

type CoachBase = {
  id: string;
  // Full name; null while coach names are not readable (issue 220), shown as "Sin dato".
  name: string | null;
  initials: string;
  color: InitialsDotProps['color'];
  groups: string[];
};

// A pending invitation is drawn with a dashed outline; there is no source of those yet, so a missing status is active.
// It has no athlete count: a count that is missing is not zero, so the model cannot hold one.
type PendingCoachRow = CoachBase & { status: 'pending'; athleteCount?: null };
type ActiveCoachRow = CoachBase & { status?: 'active'; athleteCount: number };

// One coach of the school: groups and number of athletes, never contact or document data.
export type CoachRow = ActiveCoachRow | PendingCoachRow;

export type CoachListProps = {
  coaches: CoachRow[];
  // False (the default) until a coach can really be deactivated: the action is then shown disabled.
  deactivateAvailable?: boolean;
  // Only reports the press: the confirmation and the deactivation itself belong to the caller.
  onDeactivate: (id: string) => void;
};

// A grid of cards that wrap by themselves, two columns at most: each card has a base just over a third of the row
// and grows into what is left, so the cards of a row are even. The last card of an odd count is capped to the width
// of a card that shares its row, so it does not stretch over the whole row. A row narrower than twice CoachCard's
// minimum width, or large text, gives one column, where every card fills the row.
export function CoachList({ coaches, deactivateAvailable = false, onDeactivate }: CoachListProps) {
  const { space } = useTheme();
  const oneColumn = useTextScale() >= LARGE_TEXT_SCALE;
  const [width, setWidth] = useState<number | null>(null);
  // Unknown until the first layout: the card is capped as soon as the row is measured.
  const loneWidth = !oneColumn && coaches.length % 2 === 1 && width !== null ? twoColumnWidth(width, space[3]) : null;

  return (
    // Hidden until measured: before that the last odd card cannot be capped and would be drawn stretched for a frame.
    <View
      testID="coach-list"
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3], opacity: width === null ? 0 : 1 }}
    >
      {coaches.map((coach, index) => (
        <CoachCard
          key={coach.id}
          coach={coach}
          oneColumn={oneColumn}
          deactivateAvailable={deactivateAvailable}
          onDeactivate={onDeactivate}
          maxWidth={index === coaches.length - 1 ? (loneWidth ?? undefined) : undefined}
        />
      ))}
    </View>
  );
}
