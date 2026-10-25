import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { AccessibilityInfo, BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import '../i18n';
import { IconButton } from './IconButton';

export type SideSheetProps = {
  // Names the sheet for screen readers, for example "Detalle de Lucía Ramírez".
  label: string;
  onClose: () => void;
  children: ReactNode;
};

export const sideSheetColors: { background: ColorToken; scrim: ColorToken } = {
  background: 'surface-1',
  scrim: 'scrim',
};

// Width of the detail panel and sheet in the design-system reference; it is not a token.
export const DETAIL_WIDTH = 340;

// A sheet on the right edge of its parent, over a scrim. It fills the layout that holds it, so the layout hides
// whatever is behind it from screen readers; `accessibilityViewIsModal` does the same on iOS.
export function SideSheet({ label, onClose, children }: SideSheetProps) {
  const { colors, space, elevation } = useTheme();
  const closeRef = useRef<ComponentRef<typeof Pressable>>(null);

  // Focus moves into the sheet when it opens: the Cerrar button is its first control.
  useEffect(() => {
    if (closeRef.current) AccessibilityInfo.sendAccessibilityEvent(closeRef.current, 'focus');
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  return (
    <View testID="side-sheet-overlay" accessibilityViewIsModal style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
      <Pressable
        testID="side-sheet-scrim"
        accessible={false}
        importantForAccessibility="no"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors[sideSheetColors.scrim] }}
      />
      <View
        testID="side-sheet"
        accessibilityLabel={label}
        style={[
          {
            width: DETAIL_WIDTH,
            gap: space[4],
            padding: space[5],
            backgroundColor: colors[sideSheetColors.background],
          },
          elevation['elevation-1'],
        ]}
      >
        <View style={{ alignItems: 'flex-end' }}>
          <IconButton ref={closeRef} icon="close" label={t('schoolConsole.layout.close')} onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ gap: space[4] }}>{children}</ScrollView>
      </View>
    </View>
  );
}
