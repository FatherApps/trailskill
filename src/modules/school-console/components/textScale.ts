import { useWindowDimensions } from 'react-native';

import { typography as baseTypography, useTheme } from '../../../core/theme';

// From this text scale up, parts that sit side by side stack instead (as in SwimmerRow and HistoryList).
export const LARGE_TEXT_SCALE = 1.5;

// The text scale in effect: the gallery preview scale (theme) times the system font scale.
export function useTextScale(): number {
  const { typography } = useTheme();
  const { fontScale } = useWindowDimensions();
  return (typography.caption.fontSize / baseTypography.caption.fontSize) * fontScale;
}
