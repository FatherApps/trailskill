import { renderHook } from '@testing-library/react-native';

import { useGoBack } from '../useGoBack';

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

beforeEach(() => jest.resetAllMocks());

describe('useGoBack', () => {
  it('goes back when there is history', async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    const { result } = await renderHook(() => useGoBack());

    result.current();

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('replaces with the given fallback when there is no history', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    const { result } = await renderHook(() => useGoBack('/sign-in'));

    result.current();

    expect(mockRouter.replace).toHaveBeenCalledWith('/sign-in');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('falls back to / by default', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    const { result } = await renderHook(() => useGoBack());

    result.current();

    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('returns the same callback across renders while the fallback does not change', async () => {
    const { result, rerender } = await renderHook(() => useGoBack());
    const first = result.current;

    await rerender({});

    expect(result.current).toBe(first);
  });
});
