import { useEffect } from 'react';

import type { FamilyMeasurementRepository } from './familyMeasurements';

/**
 * Moves the times stored only on this phone before #967 to the server table once the user is signed in, so they survive signing out.
 * A failure is left for the next launch: the phone copies are removed only after they were saved in the synced table.
 */
export function useMoveLocalFamilyTimes(repository: Pick<FamilyMeasurementRepository, 'moveLocal'>, userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;
    repository.moveLocal(userId).catch(() => undefined);
  }, [repository, userId]);
}
