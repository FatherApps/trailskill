import { StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import { useTheme, type ColorToken } from '../theme';
import { Button } from './Button';

export type StepHeaderProps = {
  // 1-based current step; the design system allows four steps at most.
  step: number;
  total: number;
  title: string;
  // Back is always on screen: the flow never depends on the system back button.
  onBack: () => void;
};

export const stepHeaderColors: Record<'background' | 'step' | 'title' | 'done' | 'todo', ColorToken> = {
  background: 'surface-0',
  step: 'ink-muted',
  title: 'ink',
  done: 'primary',
  todo: 'surface-2',
};

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center' },
  bar: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 6 },
});

export function StepHeader({ step, total, title, onBack }: StepHeaderProps) {
  const { colors, space, radius, typography } = useTheme();
  const progress = t('step.progress', { step, total });

  return (
    <View style={{ gap: space[2], backgroundColor: colors[stepHeaderColors.background] }}>
      <View style={styles.topBar}>
        <Button variant="ghost" label={t('common.back')} onPress={onBack} />
      </View>
      <Text accessibilityRole="text" style={[typography.caption, { color: colors[stepHeaderColors.step] }]}>
        {progress}
      </Text>
      {/* Decorative: "Paso N de M" above is what screen readers announce. */}
      <View testID="step-bar" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.bar}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            testID={index < step ? 'step-done' : 'step-todo'}
            style={[
              styles.segment,
              {
                borderRadius: radius.full,
                backgroundColor: colors[index < step ? stepHeaderColors.done : stepHeaderColors.todo],
              },
            ]}
          />
        ))}
      </View>
      <Text accessibilityRole="header" style={[typography.title, { color: colors[stepHeaderColors.title] }]}>
        {title}
      </Text>
    </View>
  );
}
