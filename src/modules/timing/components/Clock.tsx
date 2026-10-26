import { Text } from 'react-native';

import { useTheme } from '../../../core/theme';
import { formatTime, type Hundredths } from '../../../core/time';

// The clock always shows minutes, in every state, so it keeps one shape from 0:00,00 on.
export const clockFormat = { alwaysShowMinutes: true };

// The only text with a line limit: a 72 sp mono clock at 1.3x (~383 dp for "1:31,45") is wider than a phone's content width and would wrap.
export function Clock({
  value,
  muted = false,
  onDark = false,
  hiddenFromReaders = false,
}: {
  value: Hundredths;
  muted?: boolean;
  // On the near-black panel of the series screens.
  onDark?: boolean;
  // A running clock is not a live region and is hidden: only the state is announced.
  hiddenFromReaders?: boolean;
}) {
  const { colors, typography } = useTheme();

  return (
    <Text
      testID="stopwatch-time"
      maxFontSizeMultiplier={1.3}
      adjustsFontSizeToFit
      numberOfLines={1}
      {...(hiddenFromReaders && {
        importantForAccessibility: 'no-hide-descendants' as const,
        accessibilityElementsHidden: true,
      })}
      style={[
        typography['time-display'],
        { textAlign: 'center', fontVariant: ['tabular-nums'], color: colors[onDark ? 'on-header' : muted ? 'ink-muted' : 'ink'] },
      ]}
    >
      {formatTime(value, clockFormat)}
    </Text>
  );
}
