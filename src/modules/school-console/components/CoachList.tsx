import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { useTheme } from '../../../core/theme';
import type { InitialsDotProps } from '../../../core/ui';
import '../i18n';
import { CoachCard } from './CoachCard';
import { MEASURE_TIMEOUT_MS, twoColumnWidth } from './coachGrid';
import { LARGE_TEXT_SCALE, useTextScale } from './textScale';

type CoachBase = {
  id: string;
  // Full name; null while coach names are not readable (issue 220), shown as "Sin dato".
  name: string | null;
  initials: string;
  color: InitialsDotProps['color'];
  // null when the groups could not be read: a missing list is not «Sin grupos».
  groups: string[] | null;
};

// A pending invitation is drawn with a dashed outline; there is no source of those yet.
// It has no athlete count: a count that is missing is not zero, so the model cannot hold one.
type PendingCoachRow = CoachBase & { status: 'pending'; athleteCount?: never };
// A count that could not be read is null, never 0. The status is always set, so narrowing on it cannot be forgotten.
type ActiveCoachRow = CoachBase & { status: 'active'; athleteCount: number | null };

// One coach of the school: groups and number of athletes, never contact or document data.
export type CoachRow = ActiveCoachRow | PendingCoachRow;

export type CoachListProps = {
  coaches: CoachRow[];
  // False (the default) until a coach can really be deactivated: the action is then shown disabled.
  deactivateAvailable?: boolean;
  // Only reports the press: the confirmation and the deactivation itself belong to the caller.
  onDeactivate: (id: string) => void;
};

// True once the deadline passed while still waiting for the first measure, so a missing onLayout never leaves the list invisible.
// The timer is cleared when the measure arrives and when the component unmounts.
function useMeasureTimedOut(waiting: boolean): boolean {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setTimedOut(true), MEASURE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);
  return timedOut;
}

// A grid of cards that wrap by themselves, two columns at most: each card has a base just over a third of the row
// and grows into what is left, so the cards of a row are even. The last card of an odd count is capped to the width
// of a card that shares its row, so it does not stretch over the whole row. A row narrower than twice CoachCard's
// minimum width, or large text, gives one column, where every card fills the row.
export function CoachList(props: CoachListProps) {
  const oneColumn = useTextScale() >= LARGE_TEXT_SCALE;

  // Rebuilt when the text scale crosses into or out of one column: native layout can keep the narrow cards of the grid
  // when the cell style changes in place (seen in issue 509; not re-checked without a device, so TalkBack's focus on «Desactivar»
  // is lost at that moment). The measure lives inside, so it is reset with the rebuild and no frame is drawn with the old one.
  // A change of the row's width alone does not rebuild: onLayout measures again and the cap follows it.
  return <MeasuredList key={oneColumn ? 'one-column' : 'grid'} oneColumn={oneColumn} {...props} />;
}

function MeasuredList({ oneColumn, coaches, deactivateAvailable = false, onDeactivate }: CoachListProps & { oneColumn: boolean }) {
  const { space } = useTheme();
  const [width, setWidth] = useState<number | null>(null);
  // Only the last card of an odd count in two columns needs the row's width.
  const needsMeasure = !oneColumn && coaches.length % 2 === 1;
  const waiting = needsMeasure && width === null;
  const timedOut = useMeasureTimedOut(waiting);
  const hidden = waiting && !timedOut;
  // Unknown until the first layout: the card is capped as soon as the row is measured.
  const loneWidth = needsMeasure && width !== null ? twoColumnWidth(width, space[3]) : null;

  return (
    // Hidden until measured: before that the last odd card cannot be capped and would be drawn stretched for a frame.
    // Out of touch and of the accessibility tree meanwhile, since opacity alone hides it only to the eye.
    <View
      testID="coach-list"
      pointerEvents={hidden ? 'none' : 'auto'}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={hidden}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3], opacity: hidden ? 0 : 1 }}
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
