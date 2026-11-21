import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../../core/theme';
import { OfficialImportFooter, type OfficialImportFooterProps } from './OfficialImportFooter';

// What the footer shows; null while there is no list of new results to import.
export type ImportFooterState = OfficialImportFooterProps | null;

// Lets the update container, deep inside a list, fill a footer that another screen draws outside it.
export type ImportFooterStore = {
  get: () => ImportFooterState;
  set: (next: ImportFooterState) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createImportFooterStore(): ImportFooterStore {
  let state: ImportFooterState = null;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// A stable store for the route: changing it never re-renders the route itself.
export function useImportFooterStore(): ImportFooterStore {
  return useState(createImportFooterStore)[0];
}

// Pinned to the bottom of the screen, outside the scrolling list; draws nothing without a list to import.
export function ImportFooterSlot({ store }: { store: ImportFooterStore }) {
  const { colors, space } = useTheme();
  const footer = useSyncExternalStore(store.subscribe, store.get);
  if (!footer) return null;
  return (
    // The floating phone bar rests on the bottom edge: the button sits above it, with the clearance the lists use for their last row.
    <View style={{ gap: space[2], paddingTop: space[3], paddingHorizontal: space[4], paddingBottom: space[12] * 2, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors['surface-1'] }}>
      <OfficialImportFooter {...footer} />
    </View>
  );
}
