import { renderHook, waitFor } from '@testing-library/react-native';

import type { ManagedAthleteRepository } from '../../accounts';
import { useSelfAthleteId } from '../data/useSelfAthleteId';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
function repositoryAnswering(...answers: (string | null | Error)[]): ManagedAthleteRepository {
  const next = [...answers];
  return {
    listManagedAthleteIds: async () => [],
    getSelfAthleteId: async () => {
      const answer = next.shift()!;
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

describe('useSelfAthleteId', () => {
  it('gives the athlete the user is themselves once it is read', async () => {
    const managed = repositoryAnswering('a1');
    const { result } = await renderHook(() => useSelfAthleteId(managed, 'user-1'));

    await waitFor(() => expect(result.current).toBe('a1'));
  });

  it('drops the answer when a later read fails, so no stale "tú" stays on a card', async () => {
    const managed = repositoryAnswering('a1', new Error('database closed'));
    const { result, rerender } = await renderHook((key: number) => useSelfAthleteId(managed, 'user-1', key), { initialProps: 0 });
    await waitFor(() => expect(result.current).toBe('a1'));

    await rerender(1);

    await waitFor(() => expect(result.current).toBeUndefined());
  });
});
