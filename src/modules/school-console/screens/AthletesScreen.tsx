import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Banner, Button, Icon, StateView } from '../../../core/ui';
import '../i18n';
import { AthleteDetail } from '../components/AthleteDetail';
import { AthleteFilters, type AthleteFiltersProps } from '../components/AthleteFilters';
import { AthleteIndicators, type AthleteIndicatorsProps } from '../components/AthleteIndicators';
import { AthleteTable } from '../components/AthleteTable';
import type { AthleteDetailData, AthleteFilterId, AthleteRow } from '../components/athleteTypes';
import { ConsoleLayout, consoleLayoutFor } from '../components/ConsoleLayout';
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
  | { kind: 'denied' };

export type AthletesScreenProps = {
  // The width available to the console in dp: the caller measures it (window or preview).
  width: number;
  schoolName: string;
  view: AthletesView;
  onNavigate: (id: ConsoleDestinationId) => void;
  onInvite: () => void;
  onQueryChange: (query: string) => void;
  onFilterPress: (id: AthleteFilterId) => void;
  onSelect: (id: string) => void;
  onCloseDetail: () => void;
  onViewProfile: (id: string) => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
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
  scrollEnabled = true,
}: AthletesScreenProps) {
  const { colors, space, breakpoint, typography } = useTheme();
  const compact = consoleLayoutFor(width, breakpoint) === 'compact';

  const content = view.kind === 'data' || view.kind === 'offline' ? view.content : null;
  const canInvite = content !== null || view.kind === 'empty';

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
        <Text accessibilityRole="header" style={[typography['title-lg'], { color: colors[athletesScreenColors.title] }]}>
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
    case 'denied':
      body = (
        <StateView
          kind="denied"
          title={t('schoolConsole.screen.denied.title')}
          message={t('schoolConsole.screen.denied.message')}
        />
      );
      break;
    default:
      body = (
        <>
          {view.kind === 'offline' && (
            <Banner variant="warn" icon="wifi_off">
              <Text style={typography['body-strong']}>{t('schoolConsole.screen.offline.title')}</Text>{' '}
              {/* A malformed date is left out rather than shown wrong. */}
              {storedOn
                ? t('schoolConsole.screen.offline.banner_dated', { date: storedOn })
                : t('schoolConsole.screen.offline.banner_undated')}
            </Banner>
          )}
          <AthleteIndicators {...view.content.indicators} />
          <AthleteFilters
            query={view.content.query}
            onQueryChange={onQueryChange}
            filters={view.content.filters}
            onFilterPress={onFilterPress}
          />
          <AthleteTable
            athletes={view.content.athletes}
            bestLabel={view.content.bestLabel}
            selectedId={view.content.selectedId}
            onSelect={onSelect}
            compact={compact}
          />
        </>
      );
  }

  const detail = content?.detail ?? null;

  return (
    <ConsoleLayout
      width={width}
      schoolName={schoolName}
      activeId="athletes"
      onSelect={onNavigate}
      scrollEnabled={scrollEnabled}
      detail={
        detail
          ? {
              label: t('schoolConsole.layout.detail_dialog', { name: detail.name }),
              content: <AthleteDetail athlete={detail} onViewProfile={() => onViewProfile(detail.id)} />,
              onClose: onCloseDetail,
            }
          : undefined
      }
    >
      {header}
      {body}
    </ConsoleLayout>
  );
}
