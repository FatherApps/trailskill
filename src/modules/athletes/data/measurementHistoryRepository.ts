import { createPowerSyncMeasurementRepository, type MeasurementRepository } from '../../timing';
import type { HistoryRepository } from './history';

export function createHistoryRepository(measurements: MeasurementRepository): HistoryRepository {
  return {
    async listByEvent(athleteId, event) {
      const listed = await measurements.listByAthleteEvent(athleteId, event);
      // Measurements captured in the app are the athlete's own; imported and other-school results arrive with later issues.
      return listed.map((m) => ({ ...m, origin: 'own' as const }));
    },
  };
}

export function createPowerSyncHistoryRepository(): HistoryRepository {
  return createHistoryRepository(createPowerSyncMeasurementRepository());
}
