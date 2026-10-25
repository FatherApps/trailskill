import type { HistoryMeasurement, HistoryRepository } from './history';

const newestFirst = (a: HistoryMeasurement, b: HistoryMeasurement) =>
  a.capturedAt === b.capturedAt ? a.id.localeCompare(b.id) : b.capturedAt.localeCompare(a.capturedAt);

export function createInMemoryHistoryRepository(measurements: HistoryMeasurement[]): HistoryRepository {
  return {
    async listByEvent(athleteId, { stroke, distance, pool }) {
      return measurements
        .filter((m) => m.athleteId === athleteId && m.stroke === stroke && m.distance === distance && m.pool === pool)
        .sort(newestFirst);
    },
    async listByAthlete(athleteId) {
      return measurements.filter((m) => m.athleteId === athleteId).sort(newestFirst);
    },
  };
}
