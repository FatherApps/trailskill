import { renderHook, waitFor } from '@testing-library/react-native';

import { useMoveLocalFamilyTimes } from '../data/useMoveLocalFamilyTimes';

describe('useMoveLocalFamilyTimes', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs a failed move without throwing and tries again when a sync finishes', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const moveLocal = jest.fn().mockRejectedValueOnce(new TypeError('boom')).mockResolvedValue(1);
    const repository = { moveLocal };
    const { rerender } = await renderHook(({ syncedAt }: { syncedAt?: number }) => useMoveLocalFamilyTimes(repository, 'u1', syncedAt), {
      initialProps: {},
    });

    await waitFor(() => expect(warn).toHaveBeenCalledWith('[family-timing] The phone-only times could not be moved', 'TypeError'));
    expect(moveLocal).toHaveBeenCalledWith('u1');

    await rerender({ syncedAt: 1_000 });
    await waitFor(() => expect(moveLocal).toHaveBeenCalledTimes(2));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a signed-in user', async () => {
    const moveLocal = jest.fn().mockResolvedValue(0);
    await renderHook(() => useMoveLocalFamilyTimes({ moveLocal }, undefined, 1_000));
    expect(moveLocal).not.toHaveBeenCalled();
  });
});
