import { StyleSheet, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { fontFamily, useTheme, type ColorToken } from '../../../core/theme';
import '../i18n';
import type { BlockPhase } from '../types';

// Provisional (issue 201): confirmed by the project lead, pending the maintainer and the design system.
export const phaseColors: Record<BlockPhase, { background: ColorToken; text: ColorToken }> = {
  warm_up: { background: 'sky', text: 'on-color' },
  main: { background: 'coral', text: 'on-color' },
  technique: { background: 'lilac', text: 'on-color' },
  cool_down: { background: 'surface-2', text: 'ink' },
};

const styles = StyleSheet.create({
  tag: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 24, paddingHorizontal: 10, justifyContent: 'center' },
});

// Follows the metrics of core Tag, whose variants carry state meanings and accept no brand fill. Always the text, never colour only.
export function PhaseTag({ phase }: { phase: BlockPhase }) {
  const { colors, radius, typography } = useTheme();
  const { background, text } = phaseColors[phase];
  const label = t(`training_plans.phase.${phase}`);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.tag, { borderRadius: radius.full, backgroundColor: colors[background] }]}
    >
      <Text
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={[typography.caption, { fontFamily: fontFamily.sansMedium, fontWeight: '500', color: colors[text] }]}
      >
        {label}
      </Text>
    </View>
  );
}
