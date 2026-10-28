import { ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Button, ColorCard, Icon, StateView, Tag } from '../../../core/ui';
import '../i18n';
import type { AthleteColor } from '../athleteDisplay';

export type MyAthleteCard = {
  id: string;
  // The short name ("Tomás R.").
  name: string;
  color: AthleteColor;
  // What the device knows about the athlete; a part it does not know is left out, never an empty string (it would render outside a <Text>).
  school?: string;
  group?: string;
  category?: string;
  // Whether the authorization to record times is in force; undefined while it is not known, which shows no tag.
  authorized?: boolean;
};

export type MyAthletesView = { kind: 'loading' } | { kind: 'empty' } | { kind: 'data'; athletes: MyAthleteCard[] };

export type MyAthletesScreenProps = {
  view: MyAthletesView;
  // Opens the profile (and with it the history) of the athlete.
  onOpen: (athleteId: string) => void;
  onAdd: () => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

export const myAthletesScreenColors: { title: ColorToken; category: ColorToken } = { title: 'ink', category: 'on-color' };

function AthleteCardView({ card, onOpen }: { card: MyAthleteCard; onOpen: (athleteId: string) => void }) {
  const { colors, space, typography } = useTheme();
  const place = [card.school, card.group].filter(Boolean).join(' · ');

  return (
    <ColorCard color={card.color} title={card.name} detail={place || undefined}>
      {card.category ? <Text style={[typography.caption, { color: colors[myAthletesScreenColors.category] }]}>{card.category}</Text> : null}
      {card.authorized === undefined ? null : (
        <View style={{ flexDirection: 'row', paddingTop: space[1] }}>
          {card.authorized ? (
            <Tag variant="ok" icon="verified_user" label={t('athletes.my.authorized')} />
          ) : (
            <Tag variant="warn" label={t('athletes.profile.authorization_pending')} />
          )}
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: space[2] }}>
        <Button
          variant="dark"
          label={t('athletes.my.history')}
          accessibilityHint={t('athletes.my.history_hint', { name: card.name })}
          onPress={() => onOpen(card.id)}
        />
      </View>
    </ColorCard>
  );
}

// Presentational: no network, database or repository; the caller supplies the athletes and handles the presses.
export function MyAthletesScreen({ view, onOpen, onAdd, scrollEnabled = true }: MyAthletesScreenProps) {
  const { colors, space, typography } = useTheme();
  const frame = { alignSelf: 'stretch', flex: scrollEnabled ? 1 : undefined } as const;
  const padding = { paddingHorizontal: space[4], paddingVertical: space[4], gap: space[3] };

  const header = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
      <Text accessibilityRole="header" style={[typography['title-lg'], { color: colors[myAthletesScreenColors.title] }]}>
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
      {view.athletes.map((card) => (
        <AthleteCardView key={card.id} card={card} onOpen={onOpen} />
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
