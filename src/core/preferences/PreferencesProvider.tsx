import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { defaultPreferences, type Preferences, type PreferencesRepository } from './preferences';

type PreferencesContextValue = {
  preferences: Preferences;
  // Applies at once and is saved on the device; a failed save keeps the change for this run of the app.
  update: (changes: Partial<Preferences>) => void;
};

const PreferencesContext = createContext<PreferencesContextValue>({ preferences: defaultPreferences, update: () => {} });

export function PreferencesProvider({ repository, children }: { repository: PreferencesRepository; children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);

  useEffect(() => {
    let active = true;
    repository
      .load()
      .then((loaded) => {
        if (active) setPreferences(loaded);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [repository]);

  const update = useCallback(
    (changes: Partial<Preferences>) => {
      setPreferences((current) => {
        const next = { ...current, ...changes };
        repository.save(next).catch(() => {});
        return next;
      });
    },
    [repository],
  );

  const value = useMemo(() => ({ preferences, update }), [preferences, update]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext);
}
