import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import type { Hundredths } from '../../../core/time';
import { IconButton, StateView, SwimmerRow, type SwimmerRowProps } from '../../../core/ui';
import '../i18n';
import { consoleLayoutFor, ConsoleLayout } from '../components/ConsoleLayout';

export type MySwimmerRow = {
  id: string;
  name: string;
  initials: string;
  color: NonNullable<SwimmerRowProps['color']>;
  // Category and groups, already joined.
  detail: string;
  // Never 0: null when the swimmer has no eligible time in the event of `bestLabel`.
  bestTime: Hundredths | null;
};

// Which of the view states the caller is in. Only the state that shows the swimmers carries them.
export type MySwimmersView =
  | { kind: 'data'; swimmers: MySwimmerRow[]; bestLabel: string }
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; onRetry: () => void }
  // Never synced, still reaching the backend: the first sync is running, so nothing says the connection is missing.
  | { kind: 'connecting-empty' }
  | { kind: 'offline-empty' };

export type MySwimmersScreenProps = {
  // The width available to the screen in dp: the caller measures it (window or preview).
  width: number;
  schoolName: string;
  view: MySwimmersView;
  onOpen: (id: string, name: string) => void;
  onBack: () => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
  // The entries the coach no longer finds on the home screen (the timing, the plans, sign out), under the swimmers.
  footer?: ReactNode;
};

export const mySwimmersScreenColors: { title: ColorToken; caption: ColorToken } = { title: 'ink', caption: 'ink-muted' };

// Presentational: no network, database or repository; the caller supplies everything and handles the events.
// It is the one screen of the console that a coach receives, so the layout draws no navigation.
export function MySwimmersScreen({ width, schoolName, view, onOpen, onBack, scrollEnabled, footer }: MySwimmersScreenProps) {
  const { colors, space, breakpoint, typography } = useTheme();
  const compact = consoleLayoutFor(width, breakpoint) === 'compact';

  const caption =
    view.kind === 'data'
      ? t('schoolConsole.screen.caption', { count: t('schoolConsole.mySwimmers.count', { count: view.swimmers.length }), updated: schoolName })
      : schoolName;

  let body;
  switch (view.kind) {
    case 'loading':
      body = <StateView kind="loading" />;
      break;
    case 'empty':
      body = <StateView kind="empty" icon="group" title={t('schoolConsole.mySwimmers.empty.title')} message={t('schoolConsole.mySwimmers.empty.message')} />;
      break;
    case 'error':
      body = (
        <StateView
          kind="error"
          title={t('schoolConsole.mySwimmers.error.title')}
          message={t('schoolConsole.screen.error.message')}
          action={{ label: t('schoolConsole.screen.retry'), onPress: view.onRetry }}
        />
      );
      break;
    case 'connecting-empty':
      body = <StateView kind="empty" icon="cloud_download" title={t('schoolConsole.screen.connecting.title')} message={t('schoolConsole.mySwimmers.connecting_empty')} />;
      break;
    case 'offline-empty':
      body = <StateView kind="offline" title={t('schoolConsole.screen.offline.title')} message={t('schoolConsole.mySwimmers.offline_empty')} />;
      break;
    case 'data':
      // One column on the phone; on a tablet the rows wrap into two.
      body = (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
          {view.swimmers.map((swimmer) => (
            <View key={swimmer.id} style={compact ? { flexBasis: '100%' } : { flexBasis: '48%', flexGrow: 1 }}>
              <SwimmerRow
                name={swimmer.name}
                initials={swimmer.initials}
                color={swimmer.color}
                detail={swimmer.detail}
                bestTime={swimmer.bestTime}
                bestTimeLabel={view.bestLabel}
                chevron
                onPress={() => onOpen(swimmer.id, swimmer.name)}
              />
            </View>
          ))}
        </View>
      );
  }

  return (
    <ConsoleLayout width={width} schoolName={schoolName} activeId="athletes" onSelect={() => {}} hideNav scrollEnabled={scrollEnabled}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <IconButton icon="arrow_back" label={t('common.back')} onPress={onBack} />
        <View style={{ flexShrink: 1 }}>
          {/* Last resort, as in the other console screens: a word that cannot fit at large text shrinks, never below 70 %. */}
          <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[typography['title-lg'], { color: colors[mySwimmersScreenColors.title] }]}>
            {t('schoolConsole.mySwimmers.title')}
          </Text>
          <Text style={[typography.caption, { color: colors[mySwimmersScreenColors.caption] }]}>{caption}</Text>
        </View>
      </View>
      {body}
      {footer}
    </ConsoleLayout>
  );
}
