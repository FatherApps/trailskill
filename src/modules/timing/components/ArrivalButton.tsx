import { Pressable, Text, View } from 'react-native';

import { t } from '../../../core/i18n';
import { darken, useTheme } from '../../../core/theme';
import '../i18n';

export type ArrivalButtonProps = {
  onArrival: () => void;
  // The position the next arrival gets, for "Siguiente: 4.º".
  nextPosition?: number;
  // The phone design: a smaller button with a shorter caption and no hint.
  compact?: boolean;
};

// Minimum diameters of the reference screens (LSerieLlegadas and LSerieMovil). They are layout sizes, not design-system tokens.
const DIAMETER = { tablet: 300, phone: 290 } as const;
// The halo grows 14 dp past the circle and is the only translucent layer of the screen.
const HALO = 14;
const HALO_OPACITY = { tablet: 0.25, phone: 0.22 } as const;

// The one big arrival control: tap anywhere on the circle the instant a swimmer touches the wall.
export function ArrivalButton({ onArrival, nextPosition, compact = false }: ArrivalButtonProps) {
  const { colors, space, radius, typography } = useTheme();
  const kind = compact ? 'phone' : 'tablet';
  const diameter = DIAMETER[kind];
  const label = t('timing.series.arrival');
  const next =
    nextPosition === undefined
      ? undefined
      : t(compact ? 'timing.series.next_position_short' : 'timing.series.next_position', { position: t('timing.series.position', { position: nextPosition }) });

  // The halo hugs the button, so it grows with it when large text makes the label wider.
  return (
    <View style={{ padding: HALO }}>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.full, backgroundColor: colors.action, opacity: HALO_OPACITY[kind] }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={compact ? undefined : t('timing.series.arrival_hint')}
        onPress={onArrival}
        // A circle by aspect ratio, not by a fixed size: text at a large scale makes it bigger instead of clipping.
        style={({ pressed }) => ({
          minWidth: diameter,
          minHeight: diameter,
          aspectRatio: 1,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[1],
          backgroundColor: pressed ? darken(colors.action, 0.08) : colors.action,
        })}
      >
        <Text style={[typography['display-xl'], { color: colors['on-action'] }]}>{label}</Text>
        {!compact && <Text style={[typography['body-strong'], { color: colors['on-action'] }]}>{t('timing.series.arrival_hint')}</Text>}
        {next !== undefined &&
          (compact ? (
            <Text style={[typography['time-sm'], { color: colors['on-action'] }]}>{next}</Text>
          ) : (
            <View style={{ marginTop: space[1], paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.full, backgroundColor: colors['surface-1'] }}>
              <Text style={[typography['time-sm'], { color: colors.ink }]}>{next}</Text>
            </View>
          ))}
      </Pressable>
    </View>
  );
}
