import { FlatList, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Banner, Button, Icon, StateView } from '../../../core/ui';
import '../i18n';
import { AthleteDetail } from '../components/AthleteDetail';
import { AthleteFilterOptions, filterSheetLabel, type AthleteFilterOption } from '../components/AthleteFilterOptions';
import { AthleteFilters, type AthleteFiltersProps } from '../components/AthleteFilters';
import { AthleteIndicators, type AthleteIndicatorsProps } from '../components/AthleteIndicators';
import { AthleteTable, AthleteTableHeader, AthleteTableRow, useTableForm } from '../components/AthleteTable';
import type { AthleteDetailData, AthleteFilterId, AthleteRow } from '../components/athleteTypes';
import { consoleContentPadding, ConsoleLayout, consoleLayoutFor } from '../components/ConsoleLayout';
import type { ConsoleDestinationId } from '../components/ConsoleNav';
import { formatDate } from '../components/formatDate';

export type AthletesContent = {
  // Minutes since the data was updated; `null` when it is not known.
  updatedMinutesAgo: number | null;
  indicators: AthleteIndicatorsProps;
  query: string;
  filters: AthleteFiltersProps['filters'];
  athletes: AthleteRow[];
  // The name of the personal best column, for example "MP Libre 50" (see personalBestLabel).
  bestLabel: string;
  selectedId: string | null;
  // The athlete whose detail is open, if any.
  detail: AthleteDetailData | null;
};

// Which of the view states the caller is in. Only the states that show the athletes carry their content.
export type AthletesView =
  | { kind: 'data'; content: AthletesContent }
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; onRetry: () => void }
  // Offline with stored data: the content under a dated banner. `storedOn` is the ISO date (YYYY-MM-DD) it was saved.
  | { kind: 'offline'; storedOn: string; content: AthletesContent }
  | { kind: 'offline-empty' }
  // Never synced, still reaching the backend: the first sync is running, so nothing says the connection is missing.
  | { kind: 'connecting-empty' }
  | { kind: 'denied' };

// The options of the filter whose chip was pressed, shown in a side sheet over the screen.
export type AthletesFilterSheet = {
  id: AthleteFilterId;
  options: AthleteFilterOption[];
  // The option that is applied now, if any.
  selectedId?: string;
  onChoose: (optionId: string) => void;
  onClose: () => void;
};

export type AthletesScreenProps = {
  // The width available to the console in dp: the caller measures it (window or preview).
  width: number;
  schoolName: string;
  view: AthletesView;
  onNavigate: (id: ConsoleDestinationId) => void;
  // Absent while there is no invitation flow: the button is not shown.
  onInvite?: () => void;
  onQueryChange: (query: string) => void;
  onFilterPress: (id: AthleteFilterId) => void;
  onSelect: (id: string) => void;
  onCloseDetail: () => void;
  // Absent while there is no athlete profile screen: the detail has no "Ver perfil completo".
  onViewProfile?: (id: string) => void;
  filterSheet?: AthletesFilterSheet;
  // Clears the search and the filters; the "no athlete matches" state offers it as its action.
  onClearFilters?: () => void;
  // False when a parent ScrollView scrolls instead (the development gallery). True: the athletes are a virtualized list
  // that scrolls on its own, with everything above the table as its header.
  scrollEnabled?: boolean;
};

export const athletesScreenColors: { canvas: ColorToken; title: ColorToken; caption: ColorToken } = {
  canvas: 'surface-0',
  title: 'ink',
  caption: 'ink-muted',
};

// Presentational: no network, database or repository; the caller supplies everything and handles the events.
export function AthletesScreen({
  width,
  schoolName,
  view,
  onNavigate,
  onInvite,
  onQueryChange,
  onFilterPress,
  onSelect,
  onCloseDetail,
  onViewProfile,
  filterSheet,
  onClearFilters,
  scrollEnabled = true,
}: AthletesScreenProps) {
  const { colors, space, breakpoint, typography } = useTheme();
  const layout = consoleLayoutFor(width, breakpoint);
  const compact = layout === 'compact';
  const form = useTableForm(compact);

  const content = view.kind === 'data' || view.kind === 'offline' ? view.content : null;
  const canInvite = onInvite !== undefined && (content !== null || view.kind === 'empty');

  let caption: string | null = null;
  if (content) {
    const { updatedMinutesAgo } = content;
    const updated =
      updatedMinutesAgo === null
        ? null
        : updatedMinutesAgo < 1
          ? t('schoolConsole.screen.updated_now')
          : t('schoolConsole.screen.updated', { count: updatedMinutesAgo });
    const count = t('schoolConsole.screen.count', { count: content.indicators.active });
    caption = updated ? t('schoolConsole.screen.caption', { count, updated }) : count;
  }

  const storedOn = view.kind === 'offline' ? formatDate(view.storedOn, 'long') : null;

  const header = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
      <View style={{ flexShrink: 1 }}>
        {/* Last resort: one word that cannot fit at large text ("Deportistas" in title-lg at 200 % in 360 dp) would break mid-word, so it shrinks, never below 70 %. */}
        <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[typography['title-lg'], { color: colors[athletesScreenColors.title] }]}>
          {t('schoolConsole.screen.title')}
        </Text>
        {caption ? <Text style={[typography.caption, { color: colors[athletesScreenColors.caption] }]}>{caption}</Text> : null}
      </View>
      {canInvite && (
        <Button
          variant="secondary"
          label={t('schoolConsole.screen.invite')}
          icon={<Icon name="person_add" size="icon-sm" />}
          onPress={onInvite}
        />
      )}
    </View>
  );

  let body;
  switch (view.kind) {
    case 'loading':
      body = <StateView kind="loading" />;
      break;
    case 'empty':
      // The invite button of the header is the screen's action, so the state has none of its own.
      body = (
        <StateView
          kind="empty"
          icon="group"
          title={t('schoolConsole.screen.empty.title')}
          message={t('schoolConsole.screen.empty.message')}
        />
      );
      break;
    case 'error':
      body = (
        <StateView
          kind="error"
          title={t('schoolConsole.screen.error.title')}
          message={t('schoolConsole.screen.error.message')}
          action={{ label: t('schoolConsole.screen.retry'), onPress: view.onRetry }}
        />
      );
      break;
    case 'offline-empty':
      body = (
        <StateView
          kind="offline"
          title={t('schoolConsole.screen.offline.title')}
          message={t('schoolConsole.screen.offline.message')}
        />
      );
      break;
    case 'connecting-empty':
      body = (
        <StateView
          kind="empty"
          icon="cloud_download"
          title={t('schoolConsole.screen.connecting.title')}
          message={t('schoolConsole.screen.connecting.message')}
        />
      );
      break;
    case 'denied':
      // Who can see the list is decided by roles and policies, not by this screen: the state only says it is private.
      body = (
        <StateView
          kind="denied"
          title={t('schoolConsole.screen.denied.title')}
          message=""
        />
      );
      break;
    default:
      body = null;
  }

  // The parts of the content, in the order they are shown.
  const banner =
    view.kind === 'offline' ? (
      <Banner variant="warn" icon="wifi_off">
        <Text style={typography['body-strong']}>{t('schoolConsole.screen.offline.title')}</Text>{' '}
        {/* A malformed date is left out rather than shown wrong. */}
        {storedOn ? t('schoolConsole.screen.offline.banner_dated', { date: storedOn }) : t('schoolConsole.screen.offline.banner_undated')}
      </Banner>
    ) : null;
  const noMatch = (
    <StateView
      kind="empty"
      icon="search"
      title={t('schoolConsole.screen.no_match.title')}
      message={t('schoolConsole.screen.no_match.message')}
      action={onClearFilters ? { label: t('schoolConsole.screen.no_match.clear'), onPress: onClearFilters } : undefined}
    />
  );
  const filters = content && (
    <AthleteFilters query={content.query} onQueryChange={onQueryChange} filters={content.filters} onFilterPress={onFilterPress} />
  );

  // The athletes are a virtualized list: everything above the rows is its header, so it all scrolls together.
  const virtualized = scrollEnabled && content !== null;
  if (content && !virtualized) {
    body = (
      <>
        {banner}
        <AthleteIndicators {...content.indicators} />
        {filters}
        {content.athletes.length === 0 ? (
          noMatch
        ) : (
          <AthleteTable
            athletes={content.athletes}
            bestLabel={content.bestLabel}
            selectedId={content.selectedId}
            onSelect={onSelect}
            compact={compact}
          />
        )}
      </>
    );
  }

  const virtualizedList = content && virtualized && (
    <FlatList
      data={content.athletes}
      keyExtractor={(athlete) => athlete.id}
      // The rows depend on more than the item: the selection, the form of the table and the column name.
      extraData={[content.selectedId, form.list, content.bestLabel]}
      renderItem={({ item, index }) => (
        <AthleteTableRow
          athlete={item}
          bestLabel={content.bestLabel}
          selected={item.id === content.selectedId}
          onSelect={onSelect}
          list={form.list}
          last={index === content.athletes.length - 1}
          corners={{ top: form.list && index === 0, bottom: index === content.athletes.length - 1 }}
        />
      )}
      ListHeaderComponent={
        // An element, not a component: the search field keeps its focus while the list changes.
        <View
          testID="athletes-list-header"
          onLayout={form.onLayout}
          style={{ gap: space[4], marginBottom: content.athletes.length === 0 || form.list ? space[4] : 0 }}
        >
          {header}
          {banner}
          <AthleteIndicators {...content.indicators} />
          {filters}
          {content.athletes.length > 0 && !form.list && <AthleteTableHeader bestLabel={content.bestLabel} rounded />}
        </View>
      }
      ListEmptyComponent={noMatch}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: consoleContentPadding(layout, space) }}
    />
  );

  const detail = content?.detail ?? null;

  return (
    <ConsoleLayout
      width={width}
      schoolName={schoolName}
      activeId="athletes"
      onSelect={onNavigate}
      scrollEnabled={scrollEnabled}
      childrenScroll={virtualized}
      sheet={
        filterSheet
          ? {
              label: filterSheetLabel(filterSheet.id),
              content: (
                <AthleteFilterOptions
                  id={filterSheet.id}
                  options={filterSheet.options}
                  selectedId={filterSheet.selectedId}
                  onChoose={filterSheet.onChoose}
                />
              ),
              onClose: filterSheet.onClose,
            }
          : undefined
      }
      detail={
        detail
          ? {
              label: t('schoolConsole.layout.detail_dialog', { name: detail.name }),
              content: <AthleteDetail athlete={detail} onViewProfile={onViewProfile && (() => onViewProfile(detail.id))} />,
              onClose: onCloseDetail,
            }
          : undefined
      }
    >
      {virtualizedList || (
        <>
          {header}
          {body}
        </>
      )}
    </ConsoleLayout>
  );
}
