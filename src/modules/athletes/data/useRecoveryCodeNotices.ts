import { useCallback, useEffect, useRef, useState } from 'react';

import type { AthleteRecoveryCodeRepository, RecoveryCodes } from './athleteRecoveryCodes';
import type { RecoveryCodeVault } from './recoveryCodeVault';

export type RecoveryCodeNotice = RecoveryCodes & { athleteId: string; athleteName: string };

type Input = {
  repository: AthleteRecoveryCodeRepository;
  vault: RecoveryCodeVault;
  userId: string | undefined;
  // The swimmers the user manages.
  athletes: readonly { id: string; firstName: string }[];
  online: boolean;
};

/**
 * Asks the server, once per swimmer and session, for the codes of every swimmer the user manages that has no permanent code on this
 * phone. The first notice waits on screen until the owner says they saved the codes: only then the permanent code goes to the vault and
 * the server is told, so an owner who leaves before saving them gets a new set next time (the server replaces an unconfirmed one).
 * Nothing is asked offline or for a failed read; a later change of connection asks again.
 */
export function useRecoveryCodeNotices({ repository, vault, userId, athletes, online }: Input) {
  const [notices, setNotices] = useState<RecoveryCodeNotice[]>([]);
  const asked = useRef(new Set<string>());
  const athleteKey = athletes.map((athlete) => `${athlete.id}:${athlete.firstName}`).join('|');

  useEffect(() => {
    if (!userId || !online) return;
    let active = true;
    (async () => {
      for (const athlete of athletes) {
        const key = `${userId}:${athlete.id}`;
        if (asked.current.has(key)) continue;
        asked.current.add(key);
        try {
          if (await vault.get(userId, athlete.id)) continue;
          const codes = await repository.issue(athlete.id);
          // The effect ended while the server answered: the texts were never shown, so ask again next time.
          if (!active) asked.current.delete(key);
          else if (codes) setNotices((current) => [...current, { ...codes, athleteId: athlete.id, athleteName: athlete.firstName }]);
        } catch {
          asked.current.delete(key);
        }
      }
    })();
    return () => {
      active = false;
    };
    // `athleteKey` stands for `athletes`: a new array of the same swimmers must not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, vault, userId, online, athleteKey]);

  // Rejects when the save or the confirmation failed: the notice stays and the owner can press the button again.
  const acknowledge = useCallback(
    async (notice: RecoveryCodeNotice) => {
      if (!userId) return;
      await vault.set(userId, notice.athleteId, notice.mainCode);
      await repository.confirm(notice.athleteId);
      setNotices((current) => current.filter((candidate) => candidate !== notice));
    },
    [repository, vault, userId],
  );

  return { notice: notices[0], acknowledge };
}
