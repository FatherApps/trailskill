import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button, Chip, confirmSheetColors } from '../../../core/ui';
import '../i18n';

export type FilterSheetSection = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
};

export type FilterSheetProps = {
  visible: boolean;
  sections: FilterSheetSection[];
  // The chosen value of each section ('' is "Todos"); the sheet then closes.
  onApply: (values: Record<string, string>) => void;
  // Closing without applying keeps the filters as they were.
  onClose: () => void;
};

const valuesOf = (sections: FilterSheetSection[]) => Object.fromEntries(sections.map((s) => [s.key, s.value]));

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  grab: { width: 44, height: 5, alignSelf: 'center' },
  // elevation-2 from the design system maps to Android elevation 8, as in ConfirmSheet.
  sheet: { elevation: 8, maxHeight: '85%' },
});

// The filters of the list in a bottom sheet: one group of chips per section, applied together with "Aplicar".
export function FilterSheet({ visible, sections, onApply, onClose }: FilterSheetProps) {
  const { colors, space, radius, typography } = useTheme();
  // The parent mounts the sheet when it opens, so each opening starts from the filters in use.
  const [draft, setDraft] = useState<Record<string, string>>(() => valuesOf(sections));

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: colors[confirmSheetColors.scrim] }]}>
        <Pressable testID="filter-sheet-scrim" accessible={false} importantForAccessibility="no" onPress={onClose} style={StyleSheet.absoluteFill} />
        <SafeAreaView
          edges={['bottom']}
          style={[
            styles.sheet,
            {
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
              {
                marginBottom: space[3],
                borderRadius: radius.full,
                backgroundColor: colors[confirmSheetColors.grab],
              },
            ]}
          />
          <Text accessibilityRole="header" style={[typography.title, { color: colors.ink, marginBottom: space[3] }]}>
            {t('family_timing.filters.title')}
          </Text>
          <ScrollView contentContainerStyle={{ gap: space[5], paddingBottom: space[2] }}>
            {sections.map((section) => (
              <View key={section.key} style={{ gap: space[2] }}>
                <Text style={[typography.label, { color: colors['ink-muted'] }]}>{section.label}</Text>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={section.label}
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: space[2],
                  }}
                >
                  {section.options.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={draft[section.key] === option.value}
                      onPress={() => setDraft((d) => ({ ...d, [section.key]: option.value }))}
                    />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={{ gap: space[3], marginTop: space[4] }}>
            <Button label={t('family_timing.filters.apply')} onPress={() => onApply(draft)} />
            <Button
              variant="ghost"
              label={t('family_timing.filters.clear')}
              onPress={() => setDraft(Object.fromEntries(sections.map((s) => [s.key, ''])))}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
