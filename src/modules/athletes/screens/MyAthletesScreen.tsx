import { Pressable, ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { ColorCard, StateView, useFocusRing } from '../../../core/ui';
import '../i18n';
import type { AthleteColor } from '../athleteDisplay';

export type MyAthleteCard = {
  id: string;
  // The short name ("Tomás R.").
  name: string;
  color: AthleteColor;
  // Category and group, when the device knows them. Never an empty string: it would render outside a <Text>.
  detail?: string;
};

export type MyAthletesView = { kind: 'loading' } | { kind: 'empty' } | { kind: 'data'; athletes: MyAthleteCard[] };

export type MyAthletesScreenProps = {
  view: MyAthletesView;
  onOpen: (athleteId: string) => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

export const myAthletesScreenColors: { title: ColorToken } = { title: 'ink' };

function AthleteCardButton({ card, onOpen }: { card: MyAthleteCard; onOpen: (athleteId: string) => void }) {
  const { focusProps, ring } = useFocusRing();
  const { radius } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={card.detail ? t('athletes.my.card_label', { name: card.name, detail: card.detail }) : card.name}
      onPress={() => onOpen(card.id)}
      {...focusProps}
      style={[{ borderRadius: radius.md }, ring]}
    >
      <ColorCard color={card.color} title={card.name} detail={card.detail} />
    </Pressable>
  );
}

// Presentational: no network, database or repository; the caller supplies the athletes and handles the press.
export function MyAthletesScreen({ view, onOpen, scrollEnabled = true }: MyAthletesScreenProps) {
  const { colors, space, typography } = useTheme();
  const frame = { alignSelf: 'stretch', flex: scrollEnabled ? 1 : undefined } as const;
  const padding = { paddingHorizontal: space[4], paddingVertical: space[4], gap: space[3] };

  const title = (
    <Text accessibilityRole="header" style={[typography['title-lg'], { color: colors[myAthletesScreenColors.title] }]}>
      {t('athletes.my.title')}
    </Text>
  );

  if (view.kind === 'loading') {
    return (
      <View style={[frame, padding]}>
        {title}
        <StateView kind="loading" />
      </View>
    );
  }
  if (view.kind === 'empty') {
    return (
      <View style={[frame, padding]}>
        {title}
        <StateView kind="empty" icon="group" title={t('athletes.my.empty.title')} message={t('athletes.my.empty.message')} />
      </View>
    );
  }

  const cards = (
    <>
      {title}
      {view.athletes.map((card) => (
        <AthleteCardButton key={card.id} card={card} onOpen={onOpen} />
      ))}
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
