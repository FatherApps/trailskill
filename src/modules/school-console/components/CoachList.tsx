import { View } from 'react-native';

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

// A grid of cards that wrap by themselves, two columns at most: each card has a base just over a third of the row
// and grows into what is left, so the cards of a row are even and a lone card fills it. A row narrower than twice
// CoachCard's minimum width, or large text, gives one column.
export function CoachList({ coaches, deactivateAvailable = false, onDeactivate }: CoachListProps) {
  const { space } = useTheme();
  const oneColumn = useTextScale() >= LARGE_TEXT_SCALE;

  return (
    <View testID="coach-list" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
      {coaches.map((coach) => (
        <CoachCard
          key={coach.id}
          coach={coach}
          oneColumn={oneColumn}
          deactivateAvailable={deactivateAvailable}
          onDeactivate={onDeactivate}
        />
      ))}
    </View>
  );
}
