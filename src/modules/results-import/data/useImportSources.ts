import { useEffect, useState } from 'react';

import type { ImportSource, ImportSourcesRepository } from './officialSearch';

// The sources of official results, from data. Nothing until they load or when they cannot be read: the profile then shows no
// import prompt, which is the same as having no provider, and the rest of the app is not affected.
export function useImportSources(repository: ImportSourcesRepository, enabled: boolean): ImportSource[] {
  const [sources, setSources] = useState<ImportSource[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    repository.list().then(
      (list) => current && setSources(list),
      () => current && setSources([]),
    );
    return () => {
      current = false;
    };
  }, [repository, enabled]);
  return enabled ? sources : [];
}
