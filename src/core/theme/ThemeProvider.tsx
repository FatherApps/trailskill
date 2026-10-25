import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { colors, radius, size, space, typography, type ColorToken, type ThemeName } from './tokens';

export type Theme = {
  name: ThemeName;
  colors: Record<ColorToken, string>;
  space: typeof space;
  radius: typeof radius;
  size: typeof size;
  typography: typeof typography;
};

function scaleText(scale: number): typeof typography {
  if (scale === 1) return typography;
  const entries = Object.entries(typography).map(([token, style]) => [
    token,
    {
      ...style,
      fontSize: style.fontSize * scale,
      lineHeight: style.lineHeight * scale,
      ...(style.letterSpacing !== undefined && { letterSpacing: style.letterSpacing * scale }),
    },
  ]);
  return Object.fromEntries(entries) as typeof typography;
}

function buildTheme(name: ThemeName, fontScale = 1): Theme {
  return { name, colors: colors[name], space, radius, size, typography: scaleText(fontScale) };
}

// Light is the default when the system gives no scheme, and for code rendered outside a provider.
const ThemeContext = createContext<Theme>(buildTheme('light'));

type ThemeProviderProps = {
  children: ReactNode;
  // Overrides for the development gallery: a fixed theme instead of the system one, and a text
  // scale that previews large system font sizes (the system scale still applies on top).
  name?: ThemeName;
  fontScale?: number;
};

export function ThemeProvider({ children, name: forcedName, fontScale = 1 }: ThemeProviderProps) {
  const systemName: ThemeName = useColorScheme() === 'dark' ? 'dark' : 'light';
  const name = forcedName ?? systemName;
  const theme = useMemo(() => buildTheme(name, fontScale), [name, fontScale]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
