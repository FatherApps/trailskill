import { useCallback, useEffect, useRef, useState } from 'react';

import type { AthleteRecoveryCodeRepository, RecoveryCodes } from './athleteRecoveryCodes';
import type { RecoveryCodeVault } from './recoveryCodeVault';
import { isGone, retryPendingConfirm } from './retryPendingConfirm';

type Who = { athleteId: string; athleteName: string };

// The codes to save. `replacesPrevious`: the ones the owner saved before no longer work (a newer set replaced them).
export type CodesNotice = RecoveryCodes & Who & { kind: 'codes'; replacesPrevious: boolean };
// The set the owner holds was replaced and the server has no codes to give: a newer set was confirmed on another device or account.
// Nothing here can bring it back (regenerating only replaces the recovery codes), so the notice only tells the owner.
export type ReplacedElsewhereNotice = Who & { kind: 'replaced_elsewhere' };
export type RecoveryCodeNotice = CodesNotice | ReplacedElsewhereNotice;

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
 * the server is told which set was saved. If telling the server fails, the vault keeps a marker and the next run (app start, the
 * connection coming back, or the profile row opening) tells it again; if the server answers that the set is gone, the phone forgets it
 * and asks for the current one, shown as a replacement, or, when another device already confirmed a newer set, tells the owner so.
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
        const who = { athleteId: athlete.id, athleteName: athlete.firstName };
        try {
          let replacesPrevious = false;
          const saved = await vault.get(userId, athlete.id);
          if (saved) {
            if ((await retryPendingConfirm({ repository, vault, userId, athleteId: athlete.id, code: saved })) !== 'gone') continue;
            replacesPrevious = true;
          }
          const codes = await repository.issue(athlete.id);
          // The effect ended while the server answered: the texts were never shown, so ask again next time.
          if (!active) asked.current.delete(key);
          else if (codes) setNotices((current) => [...current, { ...codes, ...who, kind: 'codes', replacesPrevious }]);
          else if (replacesPrevious) setNotices((current) => [...current, { ...who, kind: 'replaced_elsewhere' }]);
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
      const dismiss = () => setNotices((current) => current.filter((candidate) => candidate !== notice));
      if (notice.kind === 'replaced_elsewhere') return dismiss();
      // The marker goes first: a stop between the two writes must never leave a saved code the server is not told about.
      await vault.setConfirmPending(userId, notice.athleteId, true);
      try {
        await vault.set(userId, notice.athleteId, notice.mainCode);
      } catch (error) {
        await vault.setConfirmPending(userId, notice.athleteId, false).catch(() => {});
        throw error;
      }
      try {
        await repository.confirm(notice.athleteId, notice.mainCode);
      } catch (error) {
        if (!isGone(error)) throw error;
        // Another device or account asked for codes in between: these texts do not work. Forget them and show the current set, or tell
        // the owner when that one was already confirmed elsewhere.
        await vault.remove(userId, notice.athleteId);
        const next = await repository.issue(notice.athleteId);
        const who = { athleteId: notice.athleteId, athleteName: notice.athleteName };
        const replacement: RecoveryCodeNotice = next ? { ...next, ...who, kind: 'codes', replacesPrevious: true } : { ...who, kind: 'replaced_elsewhere' };
        setNotices((current) => current.map((candidate) => (candidate === notice ? replacement : candidate)));
        return;
      }
      // The server knows; a failure to clear the marker only repeats an idempotent confirmation later.
      await vault.setConfirmPending(userId, notice.athleteId, false).catch(() => {});
      dismiss();
    },
    [repository, vault, userId],
  );

  return { notice: notices[0], acknowledge };
}
