import type { HistoryMeasurement, HistoryRepository } from './history';

export function createInMemoryHistoryRepository(measurements: HistoryMeasurement[]): HistoryRepository {
  return {
    async listByEvent(athleteId, { stroke, distance, pool }) {
      return measurements
        .filter((m) => m.athleteId === athleteId && m.stroke === stroke && m.distance === distance && m.pool === pool)
        .sort((a, b) => (a.capturedAt === b.capturedAt ? a.id.localeCompare(b.id) : b.capturedAt.localeCompare(a.capturedAt)));
    },
  };
}
