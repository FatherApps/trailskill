import { createPowerSyncMeasurementRepository, type Measurement, type MeasurementRepository } from '../../timing';
import type { HistoryMeasurement, HistoryRepository } from './history';

// Measurements captured in the app are the athlete's own; imported and other-school results arrive with later issues.
const asOwn = (listed: Measurement[]): HistoryMeasurement[] => listed.map((m) => ({ ...m, origin: 'own' as const }));

export function createHistoryRepository(measurements: MeasurementRepository): HistoryRepository {
  return {
    async listByEvent(athleteId, event) {
      return asOwn(await measurements.listByAthleteEvent(athleteId, event));
    },
    async listByAthletesEvent(athleteIds, event) {
      return asOwn(await measurements.listByAthletesEvent(athleteIds, event));
    },
    async listByAthlete(athleteId) {
      return asOwn(await measurements.listByAthlete(athleteId));
    },
  };
}

export function createPowerSyncHistoryRepository(): HistoryRepository {
  return createHistoryRepository(createPowerSyncMeasurementRepository());
}
