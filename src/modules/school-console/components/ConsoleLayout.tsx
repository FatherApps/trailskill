import { useEffect, type ReactNode } from 'react';
import { BackHandler, ScrollView, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type Theme } from '../../../core/theme';
import '../i18n';
import { ConsoleNav, type ConsoleDestinationId } from './ConsoleNav';
import { IconButton } from './IconButton';
import { DETAIL_WIDTH, SideSheet } from './SideSheet';
import { LARGE_TEXT_SCALE, useTextScale } from './textScale';

export type ConsoleLayoutKind = 'expanded' | 'medium' | 'compact';

// The layout of a width in dp, cut exactly at the breakpoint tokens: expanded from bp-expanded, medium from bp-medium.
export function consoleLayoutFor(width: number, breakpoint: Theme['breakpoint']): ConsoleLayoutKind {
  if (width >= breakpoint['bp-expanded']) return 'expanded';
  if (width >= breakpoint['bp-medium']) return 'medium';
  return 'compact';
}

export type ConsoleLayoutProps = {
  // The width available to the console, in dp. Measured by the caller (window or preview).
  width: number;
  schoolName: string;
  activeId: ConsoleDestinationId;
  onSelect: (id: ConsoleDestinationId) => void;
  children: ReactNode;
  // The open detail, if any: a panel beside the content (expanded), a side sheet (medium) or a full screen (compact).
  detail?: { label: string; content: ReactNode; onClose: () => void };
  // False when a parent scroll view scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

// Hides what is behind an open sheet from screen readers.
const hiddenBehind = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

export function ConsoleLayout({ width, schoolName, activeId, onSelect, children, detail, scrollEnabled = true }: ConsoleLayoutProps) {
  const { colors, space, breakpoint } = useTheme();
  const layout = consoleLayoutFor(width, breakpoint);
  const largeText = useTextScale() >= LARGE_TEXT_SCALE;

  const padding = layout === 'compact' ? space[4] : space[6];
  const content = scrollEnabled ? (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding, gap: space[4] }}>
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding, gap: space[4] }}>{children}</View>
  );

  // The compact detail is a whole screen, so the Android back button closes it like Volver.
  const closeCompactDetail = layout === 'compact' ? detail?.onClose : undefined;
  useEffect(() => {
    if (!closeCompactDetail) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeCompactDetail();
      return true;
    });
    return () => subscription.remove();
  }, [closeCompactDetail]);

  const root = { flexGrow: 1, alignSelf: 'stretch', backgroundColor: colors['surface-0'] } as const;
  // A detail taller than the screen scrolls on its own; in the gallery the page scrolls instead.
  const scrollDetail = (node: ReactNode) =>
    scrollEnabled ? (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: space[4] }}>
        {node}
      </ScrollView>
    ) : (
      node
    );

  if (layout === 'compact') {
    if (!detail) return <View style={root}>{content}</View>;
    return (
      <View style={[root, { padding, gap: space[4], backgroundColor: colors['surface-1'] }]}>
        <View style={{ alignItems: 'flex-start' }}>
          <IconButton icon="arrow_back" label={t('common.back')} onPress={detail.onClose} />
        </View>
        {scrollDetail(detail.content)}
      </View>
    );
  }

  // The 240 dp side panel cannot hold the labels whole at large text: the top navigation, whose pills wrap, takes over.
  const sideNav = layout === 'expanded' && !largeText;
  const nav = (
    <ConsoleNav
      variant={sideNav ? 'side' : 'top'}
      activeId={activeId}
      onSelect={onSelect}
      schoolName={schoolName}
    />
  );
  const sheetOpen = layout === 'medium' && detail !== undefined;

  return (
    <View style={root}>
      <View {...(sheetOpen ? hiddenBehind : null)} style={{ flexGrow: 1, flexDirection: sideNav ? 'row' : 'column' }}>
        {nav}
        {/* Expanded with the top navigation: the content and the detail panel share the row under it. */}
        <View style={{ flexGrow: 1, flex: 1, flexDirection: layout === 'expanded' ? 'row' : 'column' }}>
          {content}
          {layout === 'expanded' && detail && (
            <View
              testID="detail-panel"
              style={{
                width: DETAIL_WIDTH,
                gap: space[4],
                padding: space[5],
                backgroundColor: colors['surface-1'],
              }}
            >
              <View style={{ alignItems: 'flex-end' }}>
                <IconButton icon="close" label={t('schoolConsole.layout.close')} onPress={detail.onClose} />
              </View>
              {scrollDetail(detail.content)}
            </View>
          )}
        </View>
      </View>
      {sheetOpen && (
        <SideSheet label={detail.label} onClose={detail.onClose}>
          {detail.content}
        </SideSheet>
      )}
    </View>
  );
}
