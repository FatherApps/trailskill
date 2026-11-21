import { useEffect } from 'react';

import type { FamilyMeasurementRepository } from './familyMeasurements';

/**
 * Moves the times stored only on this phone before #967 to the server table once the user is signed in, so they survive signing out.
 * The phone copies are removed only after the server accepted their upload, so it runs again after each sync (`syncedAt`).
 * After each sync it also removes the phone-only notes of times that left this person (#1300), for example accepted by another family.
 * A failure is logged and tried again on the next sync or launch.
 */
export function useMoveLocalFamilyTimes(
  repository: Pick<FamilyMeasurementRepository, 'moveLocal'> & Partial<Pick<FamilyMeasurementRepository, 'forgetGoneNotes'>>,
  userId: string | undefined,
  syncedAt?: number,
): void {
  useEffect(() => {
    if (!userId) return;
    // Only the error kind: its message can carry stored data.
    repository.moveLocal(userId).catch((error: unknown) => console.warn('[family-timing] The phone-only times could not be moved', error instanceof Error ? error.name : typeof error));
    // Only after a sync: before it, the phone may not hold the person's times yet, and their notes would go.
    if (syncedAt === undefined || !repository.forgetGoneNotes) return;
    repository
      .forgetGoneNotes()
      .catch((error: unknown) => console.warn('[family-timing] The notes of gone times could not be removed', error instanceof Error ? error.name : typeof error));
  }, [repository, userId, syncedAt]);
}
