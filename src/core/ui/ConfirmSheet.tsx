import { useRef, type ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme, type ColorToken } from '../theme';
import { Button } from './Button';

export type ConfirmSheetProps = {
  visible: boolean;
  // A question, for example "¿Descartar este tiempo?".
  title: string;
  // The concrete consequence, including the data it affects.
  message: string;
  // Verb + object, never "Sí" or "Aceptar".
  confirmLabel: string;
  // The safe alternative; dismissing the sheet in any way chooses it, unless onDismiss says otherwise.
  cancelLabel: string;
  // Discarding or withdrawing uses the stop button; a non-destructive confirmation uses primary.
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  // Dismissing without choosing (Android back, tap outside); defaults to onCancel. For a sheet whose cancel action is not the safe one.
  onDismiss?: () => void;
};

export const confirmSheetColors: Record<'background' | 'title' | 'message' | 'grab' | 'scrim', ColorToken> = {
  background: 'surface-1',
  title: 'ink',
  message: 'ink-muted',
  grab: 'border-strong',
  scrim: 'scrim',
};

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  grab: { width: 44, height: 5, alignSelf: 'center' },
  // elevation-2 from the design system maps to Android elevation 8.
  sheet: { elevation: 8 },
});

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
  onDismiss = onCancel,
}: ConfirmSheetProps) {
  const { colors, space, radius, typography } = useTheme();
  const titleRef = useRef<ComponentRef<typeof Text>>(null);

  // Initial focus on the title, so screen readers read the question first.
  function focusTitle() {
    const node = findNodeHandle(titleRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }

  return (
    // Translucent bars let the scrim cover the whole screen; SafeAreaView keeps the buttons above the navigation bar.
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onDismiss}
      onShow={focusTitle}
    >
      <View style={[styles.scrim, { backgroundColor: colors[confirmSheetColors.scrim] }]}>
        <Pressable
          testID="confirm-sheet-scrim"
          accessible={false}
          importantForAccessibility="no"
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView
          edges={['bottom']}
          style={[
            styles.sheet,
            {
              gap: space[3],
              paddingTop: space[3],
              paddingHorizontal: space[5],
              paddingBottom: space[6],
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              backgroundColor: colors[confirmSheetColors.background],
            },
          ]}
        >
          <View
            style={[
              styles.grab,
              { marginBottom: space[2], borderRadius: radius.full, backgroundColor: colors[confirmSheetColors.grab] },
            ]}
          />
          <Text ref={titleRef} accessibilityRole="header" style={[typography.title, { color: colors[confirmSheetColors.title] }]}>
            {title}
          </Text>
          <Text style={[typography.body, { color: colors[confirmSheetColors.message] }]}>{message}</Text>
          <Button variant={destructive ? 'stop' : 'primary'} label={confirmLabel} onPress={onConfirm} />
          <Button variant="secondary" label={cancelLabel} onPress={onCancel} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}
