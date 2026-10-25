import { useState } from 'react';

import { useTheme } from '../theme';

// The shared 2 dp focus ring for every control a hardware keyboard reaches, in core and in the console.
export function useFocusRing() {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return {
    focused,
    focusProps: { onFocus: () => setFocused(true), onBlur: () => setFocused(false) },
    ring: focused
      ? ({ outlineColor: colors.focus, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' } as const)
      : undefined,
  };
}
