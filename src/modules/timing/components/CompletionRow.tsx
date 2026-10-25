import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button, SwimmerRow, TimeValue, type SwimmerRowProps } from '../../../core/ui';
import '../i18n';

export type CompletionRowProps = {
  athlete: {
    shortName: string;
    initials: string;
    color: NonNullable<SwimmerRowProps['color']>;
    // For example the lane.
    detail?: string;
  };
  checked: boolean;
  onToggle: () => void;
  // Shown after the completion, for example a sync pill.
  status?: ReactNode;
};

const noop = () => {};

// Work that only records completion: the athlete and one "Completado" switch, never a time.
export function CompletionRow({ athlete, checked, onToggle, status }: CompletionRowProps) {
  const { space } = useTheme();

  return (
    <View>
      <SwimmerRow name={athlete.shortName} initials={athlete.initials} color={athlete.color} detail={athlete.detail ?? ''} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3], padding: space[4] }}>
        {/* The Pressable is the switch; the Button only draws it (core has no switch component). */}
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={t('timing.series.completed_for', { name: athlete.shortName })}
          accessibilityState={{ checked }}
          onPress={onToggle}
        >
          <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Button variant="secondary" label={t('timing.series.completed')} onPress={noop} />
          </View>
        </Pressable>
        {/* A completion has no time: null never prints 0,00, and "—" (not recorded) is told apart from "Completado". */}
        <TimeValue value={null} completed={checked} />
        {status}
      </View>
    </View>
  );
}
