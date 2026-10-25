import { useCallback, useEffect, useState } from 'react';

import type { CategoriesRepository, Category } from './categories';

export type CategoriesState = { status: 'loading' | 'ready' | 'error'; categories: Category[] };

export type UseCategories = {
  content: CategoriesState;
  reload: () => void;
  create: (name: string) => void;
  rename: (id: string, name: string) => void;
  move: (id: string, direction: 'up' | 'down') => void;
  setActive: (id: string, active: boolean) => void;
};

// The categories of one school, kept up to date: reloaded after each change and whenever `refreshKey` changes (a completed sync).
// A failed load or change shows the error state; `reload` looks again.
export function useCategories(repository: CategoriesRepository, schoolId: string, refreshKey?: unknown): UseCategories {
  // The answer is stored with its school, so another school never inherits it while its own load runs.
  // A reload keeps showing the previous answer until the new one arrives, so the list does not flash.
  const [answer, setAnswer] = useState<{ schoolId: string; state: CategoriesState }>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const settle = (state: CategoriesState) => active && setAnswer({ schoolId, state });
    repository
      .list(schoolId)
      .then((categories) => settle({ status: 'ready', categories }))
      .catch(() => settle({ status: 'error', categories: [] }));
    return () => {
      active = false;
    };
  }, [repository, schoolId, refreshKey, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const change = useCallback(
    (write: () => Promise<unknown>) => {
      write().then(reload, () => setAnswer({ schoolId, state: { status: 'error', categories: [] } }));
    },
    [reload, schoolId],
  );

  return {
    content: answer?.schoolId === schoolId ? answer.state : { status: 'loading', categories: [] },
    reload,
    create: (name) => change(() => repository.create(schoolId, name)),
    rename: (id, name) => change(() => repository.rename(id, name)),
    move: (id, direction) => change(() => repository.move(schoolId, id, direction)),
    setActive: (id, active) => change(() => repository.setActive(id, active)),
  };
}
