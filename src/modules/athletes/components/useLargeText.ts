import { useWindowDimensions } from 'react-native';

import { typography as baseTypography, useTheme } from '../../../core/theme';

// The same criterion as SwimmerRow: the text is large from 150 % up, whether the system or the gallery scales it.
const largeTextScale = 1.5;

// Display sizes do not fit a long word at large text, so the caller steps one size down.
export function useLargeText(): boolean {
  const { typography } = useTheme();
  const { fontScale } = useWindowDimensions();
  return (typography.caption.fontSize / baseTypography.caption.fontSize) * fontScale >= largeTextScale;
}
