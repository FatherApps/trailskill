import { useCallback, useEffect, useState } from 'react';

import { defaultSetup, restoreSetup, type Choice, type SessionSetup, type SessionSetupRepository } from '../data/sessionSetup';
import type { RosterAthlete } from './timingSession';

export type SessionSetupState = SessionSetup & {
  // False while the saved setup is read, so the screen does not show defaults that are then replaced.
  ready: boolean;
  changeChoice: (change: Partial<Choice>) => void;
  changeSelected: (update: (ids: string[]) => string[]) => void;
};

// The setup of the session shared by the screens of a flow. With a repository it is read on open and saved on every change;
// without one it only lives in memory.
export function useSessionSetup(setups: SessionSetupRepository | undefined, roster: RosterAthlete[]): SessionSetupState {
  const authorizedIds = () => roster.filter((a) => a.authorized).map((a) => a.id);
  const [setup, setSetup] = useState<SessionSetup>(() => defaultSetup(authorizedIds()));
  const [ready, setReady] = useState(!setups);

  useEffect(() => {
    if (!setups) return;
    let active = true;
    setups
      .load()
      // A failed read is the same as nothing saved.
      .catch(() => null)
      .then((saved) => {
        if (!active) return;
        setSetup(restoreSetup(saved, roster.filter((a) => a.authorized).map((a) => a.id)));
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, [setups, roster]);

  // A save that fails only loses the memory of this setup; the session in progress is not affected.
  const update = useCallback(
    (change: (current: SessionSetup) => SessionSetup) =>
      setSetup((current) => {
        const next = change(current);
        setups?.save(next).catch(() => {});
        return next;
      }),
    [setups],
  );

  return {
    ...setup,
    ready,
    changeChoice: (change) => update((s) => ({ ...s, choice: { ...s.choice, ...change } })),
    changeSelected: (fn) => update((s) => ({ ...s, selectedIds: fn(s.selectedIds) })),
  };
}
