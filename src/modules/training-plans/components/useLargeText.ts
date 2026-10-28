import { useWindowDimensions } from 'react-native';

import { typography as baseTypography, useTheme } from '../../../core/theme';

// From this combined (preview x system) text scale up, parts that sit side by side stack instead (as in SwimmerRow and HistoryList).
const LARGE_TEXT_SCALE = 1.5;

export function useLargeText(): boolean {
  const { typography } = useTheme();
  const { fontScale } = useWindowDimensions();
  return (typography.caption.fontSize / baseTypography.caption.fontSize) * fontScale >= LARGE_TEXT_SCALE;
}
