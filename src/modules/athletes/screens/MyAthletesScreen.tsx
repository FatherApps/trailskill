import { ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Button, Icon, StateView } from '../../../core/ui';
import { AthleteStack, type MyAthleteCard } from '../components/AthleteStack';
import { useLargeText } from '../components/useLargeText';
import '../i18n';

export type { MyAthleteCard };

export type MyAthletesView = { kind: 'loading' } | { kind: 'empty' } | { kind: 'data'; athletes: MyAthleteCard[] };

export type MyAthletesScreenProps = {
  view: MyAthletesView;
  // Opens the profile (and with it the history) of the athlete in front.
  onOpen: (athleteId: string) => void;
  onAdd: () => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

export const myAthletesScreenColors: { title: ColorToken; background: ColorToken } = { title: 'ink', background: 'surface-0' };

// Presentational: no network, database or repository; the caller supplies the athletes and handles the presses.
export function MyAthletesScreen({ view, onOpen, onAdd, scrollEnabled = true }: MyAthletesScreenProps) {
  const { colors, space, typography } = useTheme();
  const largeText = useLargeText();
  const frame = { alignSelf: 'stretch', flex: scrollEnabled ? 1 : undefined, backgroundColor: colors[myAthletesScreenColors.background] } as const;
  const padding = { paddingHorizontal: space[4], paddingVertical: space[4], gap: space[3] };

  const header = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
      <Text accessibilityRole="header" style={[typography[largeText ? 'title' : 'title-lg'], { color: colors[myAthletesScreenColors.title] }]}>
        {t('athletes.my.title')}
      </Text>
      <Button variant="secondary" label={t('athletes.my.add')} icon={<Icon name="person_add" />} onPress={onAdd} />
    </View>
  );

  if (view.kind === 'loading') {
    return (
      <View style={[frame, padding]}>
        {header}
        <StateView kind="loading" />
      </View>
    );
  }
  if (view.kind === 'empty') {
    return (
      <View style={[frame, padding]}>
        {header}
        <StateView kind="empty" icon="group" title={t('athletes.my.empty.title')} message={t('athletes.my.empty.message')} />
      </View>
    );
  }

  const cards = (
    <>
      {header}
      <AthleteStack athletes={view.athletes} onOpen={onOpen} />
    </>
  );
  return scrollEnabled ? (
    <ScrollView style={frame} contentContainerStyle={padding}>
      {cards}
    </ScrollView>
  ) : (
    <View style={[frame, padding]}>{cards}</View>
  );
}
