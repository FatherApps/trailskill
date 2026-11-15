import { useEffect } from 'react';

import type { FamilyMeasurementRepository } from './familyMeasurements';

/**
 * Moves the times stored only on this phone before #967 to the server table once the user is signed in, so they survive signing out.
 * The phone copies are removed only after the server accepted their upload, so it runs again after each sync (`syncedAt`).
 * A failure is logged and tried again on the next sync or launch.
 */
export function useMoveLocalFamilyTimes(
  repository: Pick<FamilyMeasurementRepository, 'moveLocal'>,
  userId: string | undefined,
  syncedAt?: number,
): void {
  useEffect(() => {
    if (!userId) return;
    // Only the error kind: its message can carry stored data.
    repository.moveLocal(userId).catch((error: unknown) => console.warn('[family-timing] The phone-only times could not be moved', error instanceof Error ? error.name : typeof error));
  }, [repository, userId, syncedAt]);
}
