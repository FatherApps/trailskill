import { Text } from 'react-native';

import { useTheme } from '../theme';
import { formatTime, type Hundredths } from '../time';

export type TimeValueProps = {
  // A missing time is `null`: formatTime shows "—", never "0,00".
  value: Hundredths | null;
  size?: 'time-lg' | 'time-md' | 'time-sm';
  // Passed to formatTime; the component defines no separator of its own.
  decimalSeparator?: ',' | '.';
};

export function TimeValue({ value, size = 'time-md', decimalSeparator }: TimeValueProps) {
  const { colors, typography } = useTheme();

  return (
    <Text
      style={[
        typography[size],
        { fontVariant: ['tabular-nums'], color: colors[value === null ? 'ink-muted' : 'ink'] },
      ]}
    >
      {formatTime(value, { decimalSeparator })}
    </Text>
  );
}
