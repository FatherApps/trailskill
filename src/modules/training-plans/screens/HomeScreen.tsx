import { ScrollView, Text, View } from 'react-native';

import { namedText, t } from '../../../core/i18n';
import type { RecordSyncState } from '../../../core/sync';
import { useTheme } from '../../../core/theme';
import type { Hundredths } from '../../../core/time';
import { Button, ChipRow, ColorCard, Icon, InitialsDot, LogoSymbol, StateView, SyncStatus, Tag, TimeValue } from '../../../core/ui';
import { useLargeText } from '../components/useLargeText';
import '../i18n';

export type HomeAthlete = { id: string; name: string; initials: string; color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4' };

export type HomeWeekDay = { day: string; weekday: string; date: number; today: boolean };

export type HomeNext = { athleteId: string; athleteName: string; initials: string; title: string; whenLabel: string; color: HomeAthlete['color'] };

export type HomeMark = { id: string; athleteName: string; event: string; detail: string; hundredths: Hundredths; color: HomeAthlete['color'] };

export type HomeContent = {
  schoolName: string | null;
  week: HomeWeekDay[];
  // Nothing to show when no assignment is coming: the section is left out, not filled in.
  next: HomeNext | null;
  marks: HomeMark[];
};

export type HomeView = { kind: 'loading' } | { kind: 'error'; onRetry: () => void } | { kind: 'data'; content: HomeContent };

export const ALL_ATHLETES = 'all';

export type HomeScreenProps = {
  view: HomeView;
  // The first name of the person; blank or absent greets without a name.
  greetingName?: string;
  athletes: HomeAthlete[];
  // ALL_ATHLETES or the id of one of `athletes`.
  selectedId: string;
  onSelect: (id: string) => void;
  syncState: RecordSyncState;
  onOpenToday: (athleteId: string) => void;
  scrollEnabled?: boolean;
};

function WeekStrip({ week }: { week: HomeWeekDay[] }) {
  const { colors, space, radius, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space[1] }}>
      {week.map(({ day, weekday, date, today }) => (
        <View
          key={day}
          accessible
          accessibilityLabel={t('training_plans.home.week_day', { weekday, date })}
          accessibilityState={{ selected: today }}
          style={{ flex: 1, alignItems: 'center', paddingVertical: space[2], borderRadius: radius.md, backgroundColor: colors[today ? 'primary' : 'surface-1'] }}
        >
          {/* Seven cells cannot grow with the text: the abbreviation shrinks to fit its cell instead of breaking letter by letter. */}
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[typography.caption, { color: colors[today ? 'on-primary' : 'ink-muted'] }]}>
            {weekday}
          </Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[typography['body-strong'], { color: colors[today ? 'on-primary' : 'ink'] }]}>
            {date}
          </Text>
        </View>
      ))}
    </View>
  );
}

function NextCard({ next, onOpen }: { next: HomeNext; onOpen: () => void }) {
  const { colors, space, radius, typography } = useTheme();
  const large = useLargeText();
  const when = <Tag icon="schedule" label={next.whenLabel} />;
  return (
    <>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
        {t('training_plans.home.next_title')}
      </Text>
      <View>
        <ColorCard color={next.color} title={next.title} decoration={{ dot: 'sky' }}>
          {/* With large text the tag stays in the flow under the title, where it cannot overlap it. */}
          {large && when}
          {/* The athlete on the left and the action on the right, in one row; with large text they stack. */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: large ? 'wrap' : 'nowrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: large ? space[2] : space[1],
              marginTop: space[2],
            }}
          >
            <View
              style={{
                flexShrink: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[1],
                padding: space[1],
                paddingRight: space[2],
                borderRadius: radius.full,
                backgroundColor: colors['surface-1'],
              }}
            >
              <InitialsDot initials={next.initials} color={next.color} />
              <Text numberOfLines={large ? undefined : 1} style={[typography.label, { flexShrink: 1, color: colors.ink }]}>
                {next.athleteName}
              </Text>
            </View>
            <Button variant="dark" label={t('training_plans.home.next_action')} onPress={onOpen} trailingIcon={<Icon name="arrow_forward" color="on-primary" size="icon-sm" />} />
          </View>
        </ColorCard>
        {/* shortcut: ColorCard puts its title first, so the day tag is laid over the empty top of the card, where the mockup has it; upgrade with a slot above the title in core. */}
        {!large && <View style={{ position: 'absolute', top: space[4], left: space[4] }}>{when}</View>}
      </View>
    </>
  );
}

function MarkRow({ mark }: { mark: HomeMark }) {
  const { colors, space, radius, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: colors['surface-1'] }}>
      <View style={{ width: space[1], alignSelf: 'stretch', borderRadius: radius.full, backgroundColor: colors[mark.color] }} />
      {/* With large text the time drops below the lines instead of squeezing them into a narrow column. */}
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <View style={{ flexGrow: 1, flexBasis: space[12] * 3 }}>
          <Text style={[typography['body-strong'], { color: colors.ink }]}>{t('training_plans.home.mark_title', { name: mark.athleteName, event: mark.event })}</Text>
          <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{mark.detail}</Text>
        </View>
        <TimeValue value={mark.hundredths} size="time-md" />
      </View>
    </View>
  );
}

// Presentational: no network, database or repository; the caller supplies the state and handles the events.
export function HomeScreen({ view, greetingName = '', athletes, selectedId, onSelect, syncState, onOpenToday, scrollEnabled = true }: HomeScreenProps) {
  const { colors, space, typography } = useTheme();
  const content = view.kind === 'data' ? view.content : null;
  const empty = content && !content.next && content.marks.length === 0;

  return (
    <ScrollView nestedScrollEnabled scrollEnabled={scrollEnabled} style={{ backgroundColor: colors['surface-0'] }} contentContainerStyle={{ padding: space[4], gap: space[4] }}>
      {/* The greeting keeps a width that holds "Hola," at twice the text size; the sync pill drops below when it does not fit next to it, instead of squeezing the greeting into a column of letters. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] }}>
        <LogoSymbol size={space[8]} decorative />
        <View style={{ flexGrow: 1, minWidth: space[12] * 3 + space[8] }}>
          {content?.schoolName ? <Text style={[typography.caption, { color: colors['ink-muted'] }]}>{content.schoolName}</Text> : null}
          <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
            {namedText('training_plans.home.greeting', greetingName)}
          </Text>
        </View>
        <SyncStatus state={syncState} />
      </View>
      {athletes.length > 1 && (
        <ChipRow
          accessibilityLabel={t('training_plans.home.athlete_picker')}
          value={selectedId}
          onChange={onSelect}
          options={[
            { value: ALL_ATHLETES, label: t('training_plans.home.all') },
            ...athletes.map(({ id, name, initials, color }) => ({ value: id, label: name, dot: { initials, color } })),
          ]}
        />
      )}
      {view.kind === 'loading' && <StateView kind="loading" />}
      {view.kind === 'error' && (
        <StateView
          kind="error"
          title={t('training_plans.home.error_title')}
          message={t('training_plans.home.error_message')}
          action={{ label: t('training_plans.home.retry'), onPress: view.onRetry }}
        />
      )}
      {content && (
        <>
          {content.next && <NextCard next={content.next} onOpen={() => onOpenToday(content.next!.athleteId)} />}
          <WeekStrip week={content.week} />
          {content.marks.length > 0 && (
            <>
              <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
                {t('training_plans.home.week_title')}
              </Text>
              {content.marks.map((mark) => (
                <MarkRow key={mark.id} mark={mark} />
              ))}
            </>
          )}
          {empty && <StateView kind="empty" icon="home" title={t('training_plans.home.empty_title')} message={t('training_plans.home.empty_message')} />}
        </>
      )}
    </ScrollView>
  );
}
