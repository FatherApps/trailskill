import { renderHook } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';
import type { ReactNode } from 'react';

import { ThemeProvider, useTheme } from '../ThemeProvider';

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
