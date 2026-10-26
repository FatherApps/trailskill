import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '../../../core/theme';
import { Icon, useFocusRing } from '../../../core/ui';

export type AddAthleteCardProps = {
  label: string;
  // The profile is being saved: the card stays on screen but ignores presses.
  busy?: boolean;
  onPress: () => void;
};

const styles = StyleSheet.create({
  // Border 2 dashed: the "add another" card of LRegistroUsuario2; the stroke is the design system's strong border token.
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed' },
  label: { flexShrink: 1, textAlign: 'center' },
});

// A dashed outlined card that adds one more profile (LRegistroUsuario2); the whole card is the touch target.
export function AddAthleteCard({ label, busy = false, onPress }: AddAthleteCardProps) {
  const { colors, space, radius, size, typography } = useTheme();
  const { focusProps, ring } = useFocusRing();

  return (
    <Pressable
      {...focusProps}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={[
        styles.card,
        {
          gap: space[2],
          padding: space[4],
          minHeight: size['target-min'],
          borderRadius: radius.md,
          borderColor: colors['border-strong'],
        },
        ring,
      ]}
    >
      {busy ? <ActivityIndicator color={colors.ink} /> : <Icon name="person_add" />}
      <Text style={[styles.label, typography['body-strong'], { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}
