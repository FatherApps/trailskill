import type { AthleteRecoveryCodeRepository } from './athleteRecoveryCodes';
import type { RecoveryCodeVault } from './recoveryCodeVault';

// The server no longer honours the set the phone holds: another one replaced it, or the server has no codes for the swimmer.
export const isGone = (error: unknown) => error instanceof Error && (error.message === 'recovery_set_superseded' || error.message === 'no_recovery_identity');

type Input = { repository: AthleteRecoveryCodeRepository; vault: RecoveryCodeVault; userId: string; athleteId: string; code: string };

/**
 * Tells the server which set the owner saved, when the vault still holds the marker of a confirmation that failed. Returns `none` with
 * no marker, `confirmed` once the server has it (the marker is cleared), and `gone` when the server says that set was replaced: the
 * phone forgets the code (and the marker), because it no longer works. Any other failure (no signal) rejects and keeps the marker.
 */
export async function retryPendingConfirm({ repository, vault, userId, athleteId, code }: Input): Promise<'none' | 'confirmed' | 'gone'> {
  if (!(await vault.isConfirmPending(userId, athleteId))) return 'none';
  try {
    await repository.confirm(athleteId, code);
  } catch (error) {
    if (!isGone(error)) throw error;
    await vault.remove(userId, athleteId);
    return 'gone';
  }
  // The server knows; a failure to clear the marker only repeats an idempotent confirmation later.
  await vault.setConfirmPending(userId, athleteId, false).catch(() => {});
  return 'confirmed';
}
