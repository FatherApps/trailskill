import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import { Banner, Button, Icon, StateView, type IconName } from '../../../core/ui';
import '../i18n';
import { ConsoleLayout, consoleLayoutFor } from './ConsoleLayout';
import type { ConsoleDestinationId } from './ConsoleNav';
import { formatDate } from './formatDate';

// Which of the view states a section is in. Only the states that show the records carry their content.
export type SectionView<Content> =
  | { kind: 'data'; content: Content }
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; onRetry: () => void }
  // Offline with stored data: the content under a dated banner. `storedOn` is the ISO date (YYYY-MM-DD) it was saved.
  | { kind: 'offline'; storedOn: string; content: Content }
  | { kind: 'offline-empty' }
  | { kind: 'denied' };

// The caption under the title: how many records, and how long ago they were updated (`null` when it is not known).
export type SectionSummary = { count: string; updatedMinutesAgo: number | null };

export type SectionFrameProps<Content> = {
  // The destination this section is; its texts live under `schoolConsole.<section>.*`.
  section: Exclude<ConsoleDestinationId, 'athletes' | 'settings'>;
  // The width available to the console in dp: the caller measures it (window or preview).
  width: number;
  schoolName: string;
  view: SectionView<Content>;
  onNavigate: (id: ConsoleDestinationId) => void;
  summary: (content: Content) => SectionSummary;
  // The screen's main action, shown next to the title while there is content (or none yet) to act on.
  action?: { label: string; icon: IconName; onPress: () => void };
  // The content of the section; `compact` is true in the phone layout.
  children: (content: Content, compact: boolean) => ReactNode;
  // Sheets and dialogs of the screen, drawn above the layout.
  overlay?: ReactNode;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

export const sectionFrameColors: { canvas: ColorToken; title: ColorToken; caption: ColorToken } = {
  canvas: 'surface-0',
  title: 'ink',
  caption: 'ink-muted',
};

// The frame shared by the coaches, records, measurements and authorizations screens: console layout, title, caption,
// main action and the five view states. Presentational: the caller supplies the view and handles the events.
export function SectionFrame<Content>({
  section,
  width,
  schoolName,
  view,
  onNavigate,
  summary,
  action,
  children,
  overlay,
  scrollEnabled = true,
}: SectionFrameProps<Content>) {
  const { colors, space, breakpoint, typography } = useTheme();
  const compact = consoleLayoutFor(width, breakpoint) === 'compact';

  const content = view.kind === 'data' || view.kind === 'offline' ? view.content : null;
  const canAct = action !== undefined && (content !== null || view.kind === 'empty');

  let caption: string | null = null;
  if (content) {
    const { count, updatedMinutesAgo } = summary(content);
    const updated =
      updatedMinutesAgo === null
        ? null
        : updatedMinutesAgo < 1
          ? t('schoolConsole.screen.updated_now')
          : t('schoolConsole.screen.updated', { count: updatedMinutesAgo });
    caption = updated ? t('schoolConsole.screen.caption', { count, updated }) : count;
  }

  const storedOn = view.kind === 'offline' ? formatDate(view.storedOn, 'long') : null;

  const header = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
      <View style={{ flexShrink: 1 }}>
        {/* Last resort, as in the athletes screen: a word that cannot fit at large text shrinks, never below 70 %. */}
        <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[typography['title-lg'], { color: colors[sectionFrameColors.title] }]}>
          {t(`schoolConsole.${section}.title`)}
        </Text>
        {caption ? <Text style={[typography.caption, { color: colors[sectionFrameColors.caption] }]}>{caption}</Text> : null}
      </View>
      {canAct && (
        <Button
          variant="secondary"
          label={action.label}
          icon={<Icon name={action.icon} size="icon-sm" />}
          onPress={action.onPress}
        />
      )}
    </View>
  );

  let body: ReactNode;
  switch (view.kind) {
    case 'loading':
      body = <StateView kind="loading" />;
      break;
    case 'empty':
      body = (
        <StateView
          kind="empty"
          icon={section === 'coaches' ? 'sports' : section === 'records' ? 'leaderboard' : section === 'measurements' ? 'timer' : 'shield_person'}
          title={t(`schoolConsole.${section}.empty.title`)}
          message={t(`schoolConsole.${section}.empty.message`)}
        />
      );
      break;
    case 'error':
      body = (
        <StateView
          kind="error"
          title={t(`schoolConsole.${section}.error.title`)}
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
          message={t(`schoolConsole.${section}.offline_empty`)}
        />
      );
      break;
    case 'denied':
      // Who can see it is decided by roles and policies, not by this screen: the state only says it is private.
      body = <StateView kind="denied" title={t('schoolConsole.screen.denied.title')} message="" />;
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
          {children(view.content, compact)}
        </>
      );
  }

  return (
    <>
      <ConsoleLayout width={width} schoolName={schoolName} activeId={section} onSelect={onNavigate} scrollEnabled={scrollEnabled}>
        {header}
        {body}
      </ConsoleLayout>
      {overlay}
    </>
  );
}
