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

function buildTheme(name: ThemeName): Theme {
  return { name, colors: colors[name], space, radius, size, typography };
}

// Light is the default when the system gives no scheme, and for code rendered outside a provider.
const ThemeContext = createContext<Theme>(buildTheme('light'));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const name: ThemeName = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => buildTheme(name), [name]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
