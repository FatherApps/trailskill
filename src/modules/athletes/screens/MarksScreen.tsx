import { ScrollView, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { pools, type PoolCode } from '../../../core/sport';
import { useTheme, type ColorToken } from '../../../core/theme';
import { spokenTime, type Hundredths } from '../../../core/time';
import { ChipRow, StateView, Tag, TimeValue } from '../../../core/ui';
import type { AthleteColor } from '../athleteDisplay';
import { useLargeText } from '../components/useLargeText';
import { formatDate } from '../components/formatDate';
import '../i18n';

export type MarkCard = {
  id: string;
  // "Libre 50": the meters go without the unit, as in the design.
  event: string;
  // null while the athlete has no valid time in the event: it reads "Aún sin tiempo", never zero.
  time: Hundredths | null;
  origin?: 'competition' | 'training';
  // ISO date, yyyy-mm-dd.
  date?: string;
};

export type MarksView =
  | { kind: 'loading' }
  | { kind: 'empty' }
  // The read failed: a retry, never the "Aún sin tiempo" of an event that may well have one.
  | { kind: 'error'; onRetry: () => void }
  | {
      kind: 'data';
      athletes: { id: string; name: string; initials: string; color: AthleteColor }[];
      selectedId: string;
      firstName: string;
      pool: PoolCode;
      cards: MarkCard[];
    };

export type MarksScreenProps = {
  view: MarksView;
  onSelectAthlete: (athleteId: string) => void;
  onPoolChange: (pool: PoolCode) => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

export const marksScreenColors: { title: ColorToken; background: ColorToken; card: ColorToken; empty: ColorToken; emptyBorder: ColorToken } = {
  title: 'ink',
  background: 'surface-0',
  card: 'surface-1',
  empty: 'ink-muted',
  emptyBorder: 'border',
};

function Card({ card }: { card: MarkCard }) {
  const { colors, space, radius, typography } = useTheme();
  const shortDate = card.date ? formatDate(card.date, 'day_month') : null;
  const detail =
    card.origin && shortDate
      ? t('athletes.marks.origin_and_date', { origin: t(`athletes.marks.origin.${card.origin}`), date: shortDate })
      : null;
  const box = { flexBasis: '47%', flexGrow: 1, padding: space[4], gap: space[1], borderRadius: radius.md } as const;

  if (card.time === null) {
    return (
      <View
        accessible
        accessibilityLabel={t('athletes.marks.no_time_spoken', { event: card.event })}
        style={[box, { borderWidth: 2, borderStyle: 'dashed', borderColor: colors[marksScreenColors.emptyBorder] }]}
      >
        <Text style={[typography['body-strong'], { color: colors[marksScreenColors.empty] }]}>{card.event}</Text>
        <Text style={[typography.body, { color: colors[marksScreenColors.empty] }]}>{t('athletes.marks.no_time')}</Text>
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={t('athletes.marks.card_spoken', { event: card.event, time: spokenTime(card.time), detail: detail ?? '' }).trim()}
      style={[box, { backgroundColor: colors[marksScreenColors.card] }]}
    >
      <Text style={[typography['body-strong'], { color: colors.ink }]}>{card.event}</Text>
      <TimeValue value={card.time} size="time-md" />
      {detail && <Tag label={detail} />}
    </View>
  );
}

// Presentational: no network, database or repository; the caller supplies the athletes, the pool and the cards.
export function MarksScreen({ view, onSelectAthlete, onPoolChange, scrollEnabled = true }: MarksScreenProps) {
  const { colors, space, typography } = useTheme();
  const largeText = useLargeText();
  const frame = { alignSelf: 'stretch', flex: scrollEnabled ? 1 : undefined, backgroundColor: colors[marksScreenColors.background] } as const;
  const padding = { paddingHorizontal: space[4], paddingVertical: space[4], gap: space[3] };

  if (view.kind !== 'data') {
    return (
      <View style={[frame, padding]}>
        {view.kind === 'loading' ? (
          <StateView kind="loading" />
        ) : view.kind === 'error' ? (
          <StateView
            kind="error"
            title={t('athletes.screen.error.title')}
            message={t('athletes.screen.error.message')}
            action={{ label: t('athletes.screen.retry'), onPress: view.onRetry }}
          />
        ) : (
          <StateView kind="empty" icon="emoji_events" title={t('athletes.marks.empty.title')} message={t('athletes.marks.empty.message')} />
        )}
      </View>
    );
  }

  const content = (
    <>
      <ChipRow
        accessibilityLabel={t('athletes.marks.athlete')}
        options={view.athletes.map(({ id, name, initials, color }) => ({ value: id, label: name, dot: { initials, color } }))}
        value={view.selectedId}
        onChange={onSelectAthlete}
      />
      <Text accessibilityRole="header" style={[typography[largeText ? 'title' : 'title-lg'], { color: colors[marksScreenColors.title] }]}>
        {t('athletes.marks.title', { name: view.firstName })}
      </Text>
      <ChipRow
        accessibilityLabel={t('athletes.marks.pool_group')}
        options={pools.map(({ code }) => ({ value: code, label: t(`athletes.marks.pool.${code}`) }))}
        value={view.pool}
        onChange={onPoolChange}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        {view.cards.map((card) => (
          <Card key={card.id} card={card} />
        ))}
      </View>
    </>
  );
  return scrollEnabled ? (
    <ScrollView style={frame} contentContainerStyle={padding}>
      {content}
    </ScrollView>
  ) : (
    <View style={[frame, padding]}>{content}</View>
  );
}
