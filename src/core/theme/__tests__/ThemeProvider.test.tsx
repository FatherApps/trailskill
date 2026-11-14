import { renderHook } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';
import type { ReactNode } from 'react';

import { ThemeProvider, useTheme } from '../ThemeProvider';
import { colors, elevation, typography } from '../tokens';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ default: jest.fn() }));

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

describe('useTheme', () => {
  it('uses the dark palette when the system scheme is dark', async () => {
    jest.mocked(useColorScheme).mockReturnValue('dark');

    const { result } = await renderHook(() => useTheme(), { wrapper });

    expect(result.current.name).toBe('dark');
    expect(result.current.colors['surface-0']).toBe('#121210');
  });

  it('defaults to light when the scheme is unknown', async () => {
    jest.mocked(useColorScheme).mockReturnValue(null);

    const { result } = await renderHook(() => useTheme(), { wrapper });

    expect(result.current.name).toBe('light');
    expect(result.current.colors['surface-0']).toBe('#F4F2EC');
  });
});

describe('ThemeProvider overrides', () => {
  it('keeps the system scheme and the token sizes without overrides', async () => {
    jest.mocked(useColorScheme).mockReturnValue('dark');

    const { result } = await renderHook(() => useTheme(), { wrapper });

    expect(result.current.name).toBe('dark');
    expect(result.current.typography.body).toEqual(typography.body);
  });

  it('uses the given theme name over the system scheme', async () => {
    jest.mocked(useColorScheme).mockReturnValue('dark');

    const { result } = await renderHook(() => useTheme(), {
      wrapper: ({ children }: { children: ReactNode }) => <ThemeProvider name="light">{children}</ThemeProvider>,
    });

    expect(result.current.name).toBe('light');
    expect(result.current.colors['surface-0']).toBe('#F4F2EC');
  });

  it('multiplies every text size by the given font scale', async () => {
    const { result } = await renderHook(() => useTheme(), {
      wrapper: ({ children }: { children: ReactNode }) => <ThemeProvider fontScale={2}>{children}</ThemeProvider>,
    });

    expect(result.current.typography.body).toMatchObject({ fontSize: 32, lineHeight: 48 });
    expect(result.current.typography['display-xl'].letterSpacing).toBe(-2.64);
  });
});

describe('elevation', () => {
  it.each(['light', 'dark'] as const)('elevation-1 follows the %s theme', async (name) => {
    const { result } = await renderHook(() => useTheme(), {
      wrapper: ({ children }: { children: ReactNode }) => <ThemeProvider name={name}>{children}</ThemeProvider>,
    });

    expect(result.current.elevation['elevation-1']).toEqual(elevation[name]['elevation-1']);
    expect(result.current.elevation['elevation-1']).toMatchObject({
      elevation: 2,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 24,
      shadowOpacity: name === 'light' ? 0.16 : 0.6,
    });
  });

  it('differs between themes', () => {
    expect(elevation.light['elevation-1'].shadowColor).not.toBe(elevation.dark['elevation-1'].shadowColor);
  });
});

describe('ThemeProvider mode', () => {
  function withMode(mode: 'system' | 'light' | 'dark' | 'sun') {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <ThemeProvider mode={mode}>{children}</ThemeProvider>;
    };
  }

  it('follows the system with "system"', async () => {
    jest.mocked(useColorScheme).mockReturnValue('dark');
    const { result } = await renderHook(() => useTheme(), { wrapper: withMode('system') });
    expect(result.current.variant).toBe('dark');
  });

  it('keeps a fixed light or dark palette whatever the system says', async () => {
    jest.mocked(useColorScheme).mockReturnValue('dark');
    const { result } = await renderHook(() => useTheme(), { wrapper: withMode('light') });
    expect(result.current.name).toBe('light');
    expect(result.current.colors['surface-0']).toBe('#F4F2EC');
  });

  it('builds the sun palette on light from design-system values only', async () => {
    jest.mocked(useColorScheme).mockReturnValue('dark');
    const { result } = await renderHook(() => useTheme(), { wrapper: withMode('sun') });
    expect(result.current.name).toBe('light');
    expect(result.current.variant).toBe('sun');
    expect(result.current.colors['surface-0']).toBe('#FFFFFF');
    expect(result.current.colors.border).toBe('#86817A');
    const known = new Set([...Object.values(colors.light), ...Object.values(colors.dark)]);
    for (const value of Object.values(result.current.colors)) expect(known.has(value)).toBe(true);
  });
});
