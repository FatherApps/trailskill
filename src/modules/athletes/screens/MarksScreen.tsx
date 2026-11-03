import { useRef } from 'react';
import { FlatList, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { isStroke, pools, type PoolCode } from '../../../core/sport';
import { useTheme, type ColorToken } from '../../../core/theme';
import { formatTime, spokenTime, type Hundredths } from '../../../core/time';
import { ChipRow, StateView, StrokeIcon, Tag, TimeValue } from '../../../core/ui';
import type { AthleteColor } from '../athleteDisplay';
import { useLargeText } from '../components/useLargeText';
import { formatDate } from '../components/formatDate';
import '../i18n';

export type MarkCard = {
  id: string;
  // Catalog code of the stroke, or the code as it came; the icon shows only when the catalog knows it.
  stroke: string;
  // "Libre 50 metros": the whole event, for screen readers.
  event: string;
  // "50 m": all the card shows, since the title of its group already names the stroke.
  distance: string;
  // null while the athlete has no valid time in the event: it reads "Aún sin tiempo", never zero.
  time: Hundredths | null;
  // `official`: an imported result; `sourceName` is the organization behind it, from data.
  origin?: 'competition' | 'training' | 'official';
  sourceName?: string;
  // ISO date, yyyy-mm-dd.
  date?: string;
};

// One stroke: its name from the catalog and the cards of its events, by distance.
export type MarkSectionView = { id: string; title: string; cards: MarkCard[] };

// The most recent mark of the pool, over brand color: what the card says, ready to print.
export type MarkFeatured = {
  id: string;
  stroke: string;
  // "Libre 50 metros" for screen readers; `title` is what the card shows ("Libre 50 m").
  event: string;
  title: string;
  time: Hundredths;
  origin: 'competition' | 'training' | 'official';
  sourceName?: string;
  // ISO date, yyyy-mm-dd.
  date: string;
  // Set within the last 14 days: the card carries the "Nueva" tag.
  isNew: boolean;
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
      // Null (or absent) while the pool has no marks: no card.
      featured?: MarkFeatured | null;
      sections: MarkSectionView[];
    };

export type MarksScreenProps = {
  view: MarksView;
  onSelectAthlete: (athleteId: string) => void;
  onPoolChange: (pool: PoolCode) => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

export const marksScreenColors: { title: ColorToken; count: ColorToken; background: ColorToken; card: ColorToken; empty: ColorToken; emptyBorder: ColorToken } = {
  title: 'ink',
  count: 'ink-muted',
  background: 'surface-0',
  card: 'surface-1',
  empty: 'ink-muted',
  emptyBorder: 'border-strong',
};

// The icon sits 12 dp from the top and right edges; the card reserves 64 dp on the right so the text never reaches it.
const iconInset = 12;
const iconReserve = 64;

// An official result names its organization (from data) and the year; any other shows the day and month.
function cardDetail(card: MarkCard) {
  if (!card.origin || !card.date) return null;
  if (card.origin === 'official') {
    const year = card.date.slice(0, 4);
    return t('athletes.marks.origin_and_date', { origin: card.sourceName || t('athletes.marks.origin.official'), date: year });
  }
  const shortDate = formatDate(card.date, 'day_month');
  return shortDate && t('athletes.marks.origin_and_date', { origin: t(`athletes.marks.origin.${card.origin}`), date: shortDate });
}

// `wide`: the cards stack in one column (large text), where two columns would break a word or a time.
function Card({ card, wide }: { card: MarkCard; wide: boolean }) {
  const { colors, space, radius, typography } = useTheme();
  const detail = cardDetail(card);
  const empty = card.time === null;
  const box = {
    flexBasis: wide ? undefined : '47%',
    flexGrow: 1,
    padding: space[4],
    gap: space[1],
    borderRadius: radius.md,
  } as const;
  // The first line stops short of the icon, whatever the text size.
  const title = { paddingRight: iconReserve - space[4] };
  // The stroke is a catalog code only when the catalog says so; any other value gets no icon.
  const icon = isStroke(card.stroke) && (
    <View style={{ position: 'absolute', top: iconInset, right: iconInset }}>
      <StrokeIcon stroke={card.stroke} variant={empty ? 'empty' : 'default'} decorative />
    </View>
  );

  if (card.time === null) {
    return (
      <View
        testID={`marks-card-${card.id}`}
        accessible
        accessibilityLabel={t('athletes.marks.no_time_spoken', { event: card.event })}
        style={[box, { borderWidth: 2, borderStyle: 'dashed', borderColor: colors[marksScreenColors.emptyBorder] }]}
      >
        <Text testID={`marks-title-${card.id}`} style={[typography['body-strong'], title, { color: colors[marksScreenColors.empty] }]}>
          {card.distance}
        </Text>
        <Text style={[typography.body, title, { color: colors[marksScreenColors.empty] }]}>{t('athletes.marks.no_time')}</Text>
        {icon}
      </View>
    );
  }
  return (
    <View
      testID={`marks-card-${card.id}`}
      accessible
      accessibilityLabel={t('athletes.marks.card_spoken', { event: card.event, time: spokenTime(card.time), detail: detail ?? '' }).trim()}
      style={[box, { backgroundColor: colors[marksScreenColors.card] }]}
    >
      <Text testID={`marks-title-${card.id}`} style={[typography['body-strong'], title, { color: colors.ink }]}>
        {card.distance}
      </Text>
      <TimeValue value={card.time} size="time-md" />
      {detail && <Tag label={detail} />}
      {icon}
    </View>
  );
}

// The card of the latest mark, over the athlete's color: one element for screen readers, with the icon beside the text.
function FeaturedCard({ featured, color }: { featured: MarkFeatured; color: AthleteColor }) {
  const { colors, space, radius, typography } = useTheme();
  const text = { color: colors['on-color'] };
  const origin =
    featured.origin === 'official'
      ? featured.sourceName
        ? t('athletes.marks.featured.origin.official_named', { source: featured.sourceName })
        : t('athletes.marks.featured.origin.official')
      : t(`athletes.marks.featured.origin.${featured.origin}`);
  const shortDate = formatDate(featured.date, 'day_month');
  const newDate = featured.isNew ? shortDate : null;
  const label = [
    t('athletes.marks.featured.spoken', { event: featured.event, time: spokenTime(featured.time), origin }),
    newDate && t('athletes.marks.featured.new_spoken', { date: newDate }),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <View testID="marks-featured" accessible accessibilityLabel={label} style={{ backgroundColor: colors[color], borderRadius: radius.md, padding: space[4] }}>
      <View testID="marks-featured-text" style={{ gap: space[1], paddingRight: iconReserve - space[4] }}>
        {newDate && (
          <View style={{ alignSelf: 'flex-start' }}>
            <Tag variant="ok" label={t('athletes.marks.featured.new', { date: newDate })} />
          </View>
        )}
        <Text style={[typography['body-strong'], text]}>{featured.title}</Text>
        <Text style={[typography['time-lg'], text]}>{formatTime(featured.time)}</Text>
        <Text style={[typography.caption, text]}>{origin}</Text>
      </View>
      {isStroke(featured.stroke) && (
        <View style={{ position: 'absolute', top: iconInset, right: iconInset }}>
          <StrokeIcon stroke={featured.stroke} variant="onColor" decorative />
        </View>
      )}
    </View>
  );
}

// The title says the stroke once, in display 22; it wraps with its count under it when large text leaves no room for both.
function Group({ section, wide }: { section: MarkSectionView; wide: boolean }) {
  const { colors, space, typography } = useTheme();
  const withTime = section.cards.filter((card) => card.time !== null).length;

  return (
    <View testID={`marks-section-${section.id}`} style={{ gap: space[2] }}>
      <View testID={`marks-heading-${section.id}`} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space[2] }}>
        <Text testID={`marks-group-${section.id}`} accessibilityRole="header" style={[typography.title, { color: colors[marksScreenColors.title] }]}>
          {section.title}
        </Text>
        <Text testID={`marks-count-${section.id}`} style={[typography.caption, { color: colors[marksScreenColors.count] }]}>
          {t('athletes.marks.group_count', { done: withTime, total: section.cards.length })}
        </Text>
      </View>
      <View
        testID={`marks-grid-${section.id}`}
        style={{ flexDirection: wide ? 'column' : 'row', flexWrap: wide ? 'nowrap' : 'wrap', gap: space[3] }}
      >
        {section.cards.map((card) => (
          <Card key={card.id} card={card} wide={wide} />
        ))}
      </View>
    </View>
  );
}

// Presentational: no network, database or repository; the caller supplies the athletes, the pool and the cards.
export function MarksScreen({ view, onSelectAthlete, onPoolChange, scrollEnabled = true }: MarksScreenProps) {
  const { colors, space, typography } = useTheme();
  const largeText = useLargeText();
  const list = useRef<FlatList<MarkSectionView>>(null);
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

  const { sections } = view;
  const header = (
    <View style={{ gap: space[3] }}>
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
      {view.featured && <FeaturedCard featured={view.featured} color={view.athletes.find((athlete) => athlete.id === view.selectedId)?.color ?? 'athlete-1'} />}
      {sections.length > 0 && (
        // No chip is chosen: each one only jumps to its group.
        <ChipRow
          accessibilityLabel={t('athletes.marks.style_group')}
          options={sections.map(({ id, title }) => ({ value: id, label: title }))}
          value=""
          onChange={(id) => list.current?.scrollToIndex({ index: sections.findIndex((section) => section.id === id), animated: true })}
        />
      )}
    </View>
  );
  const empty = <StateView kind="empty" icon="emoji_events" title={t('athletes.marks.empty_pool.title')} message={t('athletes.marks.empty_pool.message')} />;

  // Inside a parent ScrollView (the gallery) the groups are laid out in place; otherwise the list virtualizes them.
  if (!scrollEnabled) {
    return (
      <View style={[frame, padding]}>
        {header}
        {sections.length === 0 ? empty : sections.map((section) => <Group key={section.id} section={section} wide={largeText} />)}
      </View>
    );
  }
  return (
    <FlatList
      ref={list}
      testID="marks-list"
      style={frame}
      // The floating bar rests on the bottom edge: the last row scrolls above it.
      contentContainerStyle={{ ...padding, paddingBottom: space[12] * 2 }}
      data={sections}
      keyExtractor={(section) => section.id}
      renderItem={({ item }) => <Group section={item} wide={largeText} />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={{ marginBottom: space[3] }}
      ListEmptyComponent={empty}
      ItemSeparatorComponent={() => <View style={{ height: space[4] }} />}
      // shortcut: a group not drawn yet has no measured height, so jump near it by the average and let the list settle; exact heights would need getItemLayout.
      onScrollToIndexFailed={({ index, averageItemLength }) => list.current?.scrollToOffset({ offset: index * averageItemLength, animated: true })}
    />
  );
}
