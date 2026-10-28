import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type Theme } from '../../../core/theme';
import { IconButton, useHardwareBack } from '../../../core/ui';
import '../i18n';
import { ConsoleNav, type ConsoleDestinationId } from './ConsoleNav';
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
  // True when the children are one scrollable list that scrolls on its own (a virtualized list): the layout does not wrap
  // them in a scroll view, and they use `consoleContentPadding` as their own padding. The detail still scrolls.
  childrenScroll?: boolean;
  // A side sheet over the whole console, in every layout (for example the options of a filter). It hides what is behind it.
  sheet?: { label: string; titleKey?: string; content: ReactNode; onClose: () => void };
};

// Hides what is behind an open sheet from screen readers.
const hiddenBehind = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

// The padding around the content of a layout; a list that scrolls on its own (`childrenScroll`) applies it itself.
export const consoleContentPadding = (layout: ConsoleLayoutKind, space: Theme['space']) =>
  layout === 'compact' ? space[4] : space[6];

export function ConsoleLayout({
  width,
  schoolName,
  activeId,
  onSelect,
  children,
  detail,
  scrollEnabled = true,
  childrenScroll = false,
  sheet,
}: ConsoleLayoutProps) {
  const { colors, space, breakpoint } = useTheme();
  const layout = consoleLayoutFor(width, breakpoint);
  const largeText = useTextScale() >= LARGE_TEXT_SCALE;

  const padding = consoleContentPadding(layout, space);
  const content = childrenScroll ? (
    <View style={{ flex: 1 }}>{children}</View>
  ) : scrollEnabled ? (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding, gap: space[4] }}>
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding, gap: space[4] }}>{children}</View>
  );

  // The compact detail is a whole screen, so the Android back button closes it like Volver.
  useHardwareBack(layout === 'compact' ? detail?.onClose : undefined);

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

  // The 236 dp side card cannot hold the labels whole at large text: the top navigation, whose pills wrap, takes over.
  const sideNav = layout === 'expanded' && !largeText;
  const nav = (
    <ConsoleNav
      variant={sideNav ? 'side' : 'top'}
      activeId={activeId}
      onSelect={onSelect}
      schoolName={schoolName}
    />
  );
  const testID = `console-layout-${layout}`;
  const sheetNode = sheet && (
    <SideSheet label={sheet.label} titleKey={sheet.titleKey} onClose={sheet.onClose}>
      {sheet.content}
    </SideSheet>
  );

  if (layout === 'compact') {
    // The compact navigation is not defined in the design system, so it reuses the medium top navigation.
    if (!detail) {
      return (
        <View testID={testID} style={root}>
          <View {...(sheet ? hiddenBehind : null)} style={{ flex: 1 }}>
            {nav}
            {content}
          </View>
          {sheetNode}
        </View>
      );
    }
    return (
      <View testID={testID} style={[root, { padding, gap: space[4], backgroundColor: colors['surface-1'] }]}>
        <View style={{ alignItems: 'flex-start' }}>
          <IconButton icon="arrow_back" label={t('common.back')} onPress={detail.onClose} />
        </View>
        {scrollDetail(detail.content)}
      </View>
    );
  }
  const sheetOpen = layout === 'medium' && detail !== undefined;

  return (
    <View testID={testID} style={root}>
      <View {...(sheetOpen || sheet ? hiddenBehind : null)} style={{ flexGrow: 1, flexDirection: sideNav ? 'row' : 'column' }}>
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
      {sheetNode}
    </View>
  );
}
