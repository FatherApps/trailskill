import { renderHook } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';
import type { ReactNode } from 'react';

import { ThemeProvider, useTheme } from '../ThemeProvider';
import { typography } from '../tokens';

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
