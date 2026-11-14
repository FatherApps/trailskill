import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import {
  breakpoint,
  colors,
  elevation,
  radius,
  size,
  space,
  typography,
  type ColorToken,
  type Elevation,
  type ElevationToken,
  type ThemeName,
} from './tokens';

// The palette in use. "sun" is the light palette retuned for direct sunlight at the pool: it reuses design-system values only.
export type ThemeVariant = ThemeName | 'sun';
export type ThemeMode = 'system' | ThemeVariant;

export type Theme = {
  // The base scheme: "sun" is built on light, so code that picks a light or dark asset keeps working.
  name: ThemeName;
  variant: ThemeVariant;
  colors: Record<ColorToken, string>;
  space: typeof space;
  radius: typeof radius;
  size: typeof size;
  breakpoint: typeof breakpoint;
  elevation: Record<ElevationToken, Elevation>;
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

// shortcut: the design system has no outdoor palette yet. Sun keeps the light palette and, with values that already exist in it,
// turns the canvas white and darkens the borders; replace it with the design-system palette once the maintainer adds one.
export const sunColors: Record<ColorToken, string> = {
  ...colors.light,
  'surface-0': colors.light['surface-1'],
  border: colors.light['border-strong'],
  'border-strong': colors.light.ink,
  'viz-grid': colors.light['border-strong'],
};

function buildTheme(variant: ThemeVariant, fontScale = 1): Theme {
  const name: ThemeName = variant === 'dark' ? 'dark' : 'light';
  return {
    name,
    variant,
    colors: variant === 'sun' ? sunColors : colors[name],
    space,
    radius,
    size,
    breakpoint,
    elevation: elevation[name],
    typography: scaleText(fontScale),
  };
}

// Light is the default when the system gives no scheme, and for code rendered outside a provider.
const ThemeContext = createContext<Theme>(buildTheme('light'));

type ThemeProviderProps = {
  children: ReactNode;
  // Overrides for the development gallery: a fixed theme instead of the system one, and a text
  // scale that previews large system font sizes (the system scale still applies on top).
  name?: ThemeName;
  fontScale?: number;
  // The person's choice in Ajustes; "system" (the default) follows the phone.
  mode?: ThemeMode;
};

export function ThemeProvider({ children, name: forcedName, fontScale = 1, mode = 'system' }: ThemeProviderProps) {
  const systemName: ThemeName = useColorScheme() === 'dark' ? 'dark' : 'light';
  const variant: ThemeVariant = forcedName ?? (mode === 'system' ? systemName : mode);
  const theme = useMemo(() => buildTheme(variant, fontScale), [variant, fontScale]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
