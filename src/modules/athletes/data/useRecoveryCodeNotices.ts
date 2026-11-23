import { useCallback, useEffect, useRef, useState } from 'react';

import type { AthleteRecoveryCodeRepository, RecoveryCodes } from './athleteRecoveryCodes';
import type { RecoveryCodeVault } from './recoveryCodeVault';

export type RecoveryCodeNotice = RecoveryCodes & {
  athleteId: string;
  athleteName: string;
  // The codes the owner saved before no longer work (a newer set replaced them): these are the current ones.
  replacesPrevious: boolean;
};

type Input = {
  repository: AthleteRecoveryCodeRepository;
  vault: RecoveryCodeVault;
  userId: string | undefined;
  // The swimmers the user manages.
  athletes: readonly { id: string; firstName: string }[];
  online: boolean;
};

// The server no longer honours the set the phone holds: another one replaced it, or the server has no codes for the swimmer.
const isGone = (error: unknown) => error instanceof Error && (error.message === 'recovery_set_superseded' || error.message === 'no_recovery_identity');

/**
 * Asks the server, once per swimmer and session, for the codes of every swimmer the user manages that has no permanent code on this
 * phone. The first notice waits on screen until the owner says they saved the codes: only then the permanent code goes to the vault and
 * the server is told which set was saved. If telling the server fails, the vault keeps a marker and the next run (app start, or the
 * connection coming back) tells it again; if the server answers that the set is gone, the phone forgets it and asks for the current
 * one, shown as a replacement. Nothing is asked offline or for a failed read; a later change of connection asks again.
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
          let replacesPrevious = false;
          const saved = await vault.get(userId, athlete.id);
          if (saved) {
            if (!(await vault.isConfirmPending(userId, athlete.id))) continue;
            try {
              await repository.confirm(athlete.id, saved);
              await vault.setConfirmPending(userId, athlete.id, false);
              continue;
            } catch (error) {
              if (!isGone(error)) throw error;
              await vault.remove(userId, athlete.id);
              replacesPrevious = true;
            }
          }
          const codes = await repository.issue(athlete.id);
          // The effect ended while the server answered: the texts were never shown, so ask again next time.
          if (!active) asked.current.delete(key);
          else if (codes) setNotices((current) => [...current, { ...codes, athleteId: athlete.id, athleteName: athlete.firstName, replacesPrevious }]);
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

  // Rejects when the save or the confirmation failed: the notice stays, the vault keeps the marker, and the owner can press the button again.
  const acknowledge = useCallback(
    async (notice: RecoveryCodeNotice) => {
      if (!userId) return;
      await vault.set(userId, notice.athleteId, notice.mainCode);
      await vault.setConfirmPending(userId, notice.athleteId, true);
      try {
        await repository.confirm(notice.athleteId, notice.mainCode);
      } catch (error) {
        if (!isGone(error)) throw error;
        // Another phone asked for codes in between: these texts do not work. Forget them and show the current set instead.
        await vault.remove(userId, notice.athleteId);
        const next = await repository.issue(notice.athleteId);
        setNotices((current) => current.flatMap((candidate) => (candidate !== notice ? [candidate] : next ? [{ ...notice, ...next, replacesPrevious: true }] : [])));
        return;
      }
      // The server knows; a failure to clear the marker only repeats an idempotent confirmation on the next start.
      await vault.setConfirmPending(userId, notice.athleteId, false).catch(() => {});
      setNotices((current) => current.filter((candidate) => candidate !== notice));
    },
    [repository, vault, userId],
  );

  return { notice: notices[0], acknowledge };
}
