import { renderHook, waitFor } from '@testing-library/react-native';

import type { AuthorizationStatusRepository } from '../../accounts';
import { useAuthorizedAthletes } from '../data/useAuthorizedAthletes';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
function repositoryAnswering(...answers: (string[] | Error)[]): AuthorizationStatusRepository {
  const next = [...answers];
  return {
    listGrantedAthleteIds: async () => {
      const answer = next.shift()!;
      if (answer instanceof Error) throw answer;
      return answer;
    },
    listStatuses: async () => [],
  };
}

describe('useAuthorizedAthletes', () => {
  it('gives the granted ids once they are read', async () => {
    const authorizations = repositoryAnswering(['a1']);
    const { result } = await renderHook(() => useAuthorizedAthletes(authorizations));

    await waitFor(() => expect(result.current).toEqual(new Set(['a1'])));
  });

  it('drops the granted ids when a later read fails, so no stale "Autorizado" stays on a withdrawn authorization', async () => {
    const authorizations = repositoryAnswering(['a1'], new Error('database closed'));
    const { result, rerender } = await renderHook((key: number) => useAuthorizedAthletes(authorizations, key), { initialProps: 0 });
    await waitFor(() => expect(result.current).toEqual(new Set(['a1'])));

    await rerender(1);

    await waitFor(() => expect(result.current).toBeUndefined());
  });
});
