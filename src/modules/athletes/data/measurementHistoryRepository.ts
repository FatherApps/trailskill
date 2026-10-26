import { createPowerSyncMeasurementRepository, type Measurement, type MeasurementRepository } from '../../timing';
import type { HistoryMeasurement, HistoryRepository } from './history';

// Measurements captured with the app or an external button; imported and other-school results arrive with later issues.
const withOrigin = (listed: Measurement[]): HistoryMeasurement[] =>
  listed.map((m) => ({ ...m, origin: m.source === 'external_button' ? ('external_timer' as const) : ('own' as const) }));

export function createHistoryRepository(measurements: MeasurementRepository): HistoryRepository {
  return {
    async listByEvent(athleteId, event) {
      return withOrigin(await measurements.listByAthleteEvent(athleteId, event));
    },
    async listByAthletesEvent(athleteIds, event) {
      return withOrigin(await measurements.listByAthletesEvent(athleteIds, event));
    },
    async listByAthlete(athleteId) {
      return withOrigin(await measurements.listByAthlete(athleteId));
    },
  };
}

export function createPowerSyncHistoryRepository(): HistoryRepository {
  return createHistoryRepository(createPowerSyncMeasurementRepository());
}
