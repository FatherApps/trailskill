import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button, StateView, SwimmerRow } from '../../../core/ui';
import { TimingHeader } from '../components/TimingHeader';
import '../i18n';
import type { SetupAthlete } from './TimingSetupScreen';

export type PickerAthlete = Pick<SetupAthlete, 'id' | 'shortName' | 'initials' | 'color'>;

export type AthletePickerScreenProps = {
  // For example the school name.
  subtitle: string;
  // The athletes who can be chosen.
  athletes: PickerAthlete[];
  // In timing order: the order they were chosen.
  selectedIds: string[];
  groupCount: number;
  onToggle: (id: string) => void;
  onDone: () => void;
  onBack: () => void;
};

// Picks who is timed in the session; the number on a chosen row is its place in the timing order.
export function AthletePickerScreen({ subtitle, athletes, selectedIds, groupCount, onToggle, onDone, onBack }: AthletePickerScreenProps) {
  const { colors, space, radius } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors['surface-0'] }}>
      <TimingHeader
        title={t('timing.picker.title')}
        subtitle={t('timing.setup.athletes_count', { selected: selectedIds.length, group: groupCount })}
        onBack={onBack}
      />
      <ScrollView contentContainerStyle={{ gap: space[4], padding: space[4] }}>
        {athletes.length === 0 ? (
          <StateView kind="empty" icon="group" title={t('timing.setup.empty_title')} message={t('timing.picker.empty_message')} />
        ) : (
          <View style={{ gap: 1, overflow: 'hidden', borderRadius: radius.md, backgroundColor: colors.border }}>
            {athletes.map((athlete) => {
              const order = selectedIds.indexOf(athlete.id) + 1;
              return (
                <SwimmerRow
                  key={athlete.id}
                  name={order > 0 ? t('timing.setup.athlete_name', { order, name: athlete.shortName }) : athlete.shortName}
                  initials={athlete.initials}
                  color={athlete.color}
                  detail=""
                  selected={order > 0}
                  onPress={() => onToggle(athlete.id)}
                />
              );
            })}
          </View>
        )}
        <Button label={t('timing.picker.done')} onPress={onDone} />
      </ScrollView>
    </SafeAreaView>
  );
}
