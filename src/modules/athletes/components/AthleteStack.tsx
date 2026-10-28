import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Button, ColorCard, Tag, useFocusRing } from '../../../core/ui';
import '../i18n';
import type { AthleteColor } from '../athleteDisplay';

export type MyAthleteCard = {
  id: string;
  // The short name ("Tomás R."), shown on a collapsed card.
  name: string;
  // The full name, shown on the card in front.
  firstName: string;
  lastName: string;
  color: AthleteColor;
  // What the device knows about the athlete; a part it does not know is left out, never an empty string (it would render outside a <Text>).
  school?: string;
  group?: string;
  category?: string;
  // Whether the authorization to record times is in force; undefined while it is not known, which shows no tag.
  authorized?: boolean;
  // The athlete is the user themselves (an adult who swims): their collapsed card says "tú".
  isSelf?: boolean;
};

export type AthleteStackProps = {
  athletes: MyAthleteCard[];
  // Opens the profile (and with it the history) of the athlete in front.
  onOpen: (athleteId: string) => void;
};

export const athleteStackColors: { text: ColorToken } = { text: 'on-color' };

function CollapsedCard({ card, hidden, first, onPress }: { card: MyAthleteCard; hidden: number; first: boolean; onPress: () => void }) {
  const { colors, space, radius, typography } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const name = card.isSelf ? t('athletes.my.name_you', { name: card.name }) : card.name;
  const text = { color: colors[athleteStackColors.text] };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={card.category ? t('athletes.my.card_label', { name, detail: card.category }) : name}
      accessibilityHint={t('athletes.my.bring_forward', { name: card.name })}
      onPress={onPress}
      {...focusProps}
      // Only the top strip shows: the next card covers the rest.
      style={[{ marginTop: first ? 0 : -hidden, borderRadius: radius.md }, ring]}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: space[3],
          height: space[12] + hidden,
          paddingHorizontal: space[5],
          paddingTop: space[4],
          borderRadius: radius.md,
          backgroundColor: colors[card.color],
        }}
      >
        <Text style={[typography['body-strong'], text, { flexShrink: 1 }]}>
          {name}
        </Text>
        {card.category ? (
          <Text style={[typography.caption, text, { flexShrink: 1 }]}>
            {card.category}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function FrontCard({ card, hidden, covers, onOpen }: { card: MyAthleteCard; hidden: number; covers: boolean; onOpen: () => void }) {
  const { colors, space, typography } = useTheme();
  const text = { color: colors[athleteStackColors.text] };
  const place = [card.school, card.group].filter(Boolean).join(' · ');
  // The ring and dot are brand colours that stand out on the athlete's own colour.
  const dot = card.color === 'athlete-4' ? 'coral' : 'lime';

  return (
    <View style={{ marginTop: covers ? -hidden : 0 }}>
      {/* The name is bigger than a card title, so the lines go in this order below an empty title. */}
      <ColorCard color={card.color} title="" decoration={{ dot }}>
        {place ? <Text style={[typography.caption, text]}>{place}</Text> : null}
        {card.category ? <Text style={[typography.label, text]}>{card.category.toUpperCase()}</Text> : null}
        <Text style={[typography['display-xl'], text]}>{`${card.firstName}\n${card.lastName}`}</Text>
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
            onPress={onOpen}
          />
        </View>
      </ColorCard>
    </View>
  );
}

// A wallet of cards: the athletes not chosen are collapsed one over the other, each showing only its strip, and the chosen one is open in front.
// Pressing a collapsed card brings it to the front; the order of the others does not change.
export function AthleteStack({ athletes, onOpen }: AthleteStackProps) {
  const { radius } = useTheme();
  const [chosenId, setChosenId] = useState<string>();
  // A choice that is no longer among the athletes falls back to the first one.
  const front = athletes.find((athlete) => athlete.id === chosenId) ?? athletes[0];
  if (!front) return null;
  const behind = athletes.filter((athlete) => athlete !== front);
  const hidden = radius.md;

  return (
    <View>
      {behind.map((card, index) => (
        <CollapsedCard key={card.id} card={card} hidden={hidden} first={index === 0} onPress={() => setChosenId(card.id)} />
      ))}
      <FrontCard card={front} hidden={hidden} covers={behind.length > 0} onOpen={() => onOpen(front.id)} />
    </View>
  );
}
