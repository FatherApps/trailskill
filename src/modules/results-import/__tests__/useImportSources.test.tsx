import { renderHook, waitFor } from '@testing-library/react-native';

import type { ImportSource, ImportSourcesRepository } from '../data/officialSearch';
import { useImportSources } from '../data/useImportSources';

const source: ImportSource = { organizationId: 'org-1', name: 'Federación Sintética' };

describe('useImportSources', () => {
  it('lists the sources once they load', async () => {
    const repository: ImportSourcesRepository = { list: async () => [source] };
    const { result } = await renderHook(() => useImportSources(repository, true));
    await waitFor(() => expect(result.current).toEqual([source]));
  });

  it('shows none, and asks nothing, while it is disabled', async () => {
    const list = jest.fn(async () => [source]);
    const repository: ImportSourcesRepository = { list };
    const { result } = await renderHook(() => useImportSources(repository, false));
    expect(result.current).toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });

  it('shows none when the sources cannot be read', async () => {
    const list = jest.fn<Promise<ImportSource[]>, []>().mockRejectedValue(new Error('boom'));
    const repository: ImportSourcesRepository = { list };
    const { result } = await renderHook(() => useImportSources(repository, true));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(result.current).toEqual([]);
  });
});
