import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { AccessibilityInfo, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { useTheme, type ColorToken } from '../../../core/theme';
import '../i18n';
import { IconButton } from './IconButton';

export type SideSheetProps = {
  // Names the sheet for screen readers, for example "Detalle de Lucía Ramírez".
  label: string;
  // Translation key of a title shown next to Cerrar; the caller owns its copy. The label and the initial focus do not change.
  titleKey?: string;
  onClose: () => void;
  children: ReactNode;
};

export const sideSheetColors: { background: ColorToken; scrim: ColorToken; title: ColorToken } = {
  background: 'surface-1',
  scrim: 'scrim',
  title: 'ink',
};

// Width of the detail panel and sheet in the design-system reference; it is not a token.
export const DETAIL_WIDTH = 340;

// A sheet on the right edge of its parent, over a scrim. It fills the layout that holds it, so the layout hides
// whatever is behind it from screen readers; `accessibilityViewIsModal` does the same on iOS.
export function SideSheet({ label, titleKey, onClose, children }: SideSheetProps) {
  const { colors, space, elevation, typography } = useTheme();
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: titleKey ? 'space-between' : 'flex-end', gap: space[3] }}>
          {titleKey && (
            <Text
              accessibilityRole="header"
              style={[typography.title, { flexShrink: 1, color: colors[sideSheetColors.title] }]}
            >
              {t(titleKey)}
            </Text>
          )}
          <IconButton ref={closeRef} icon="close" label={t('schoolConsole.layout.close')} onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ gap: space[4] }}>{children}</ScrollView>
      </View>
    </View>
  );
}
