import type { Measurement, MeasurementRepository } from './measurements';

export function createInMemoryMeasurementRepository(): MeasurementRepository {
  const byId = new Map<string, Measurement>();
  return {
    async add(measurement) {
      byId.set(measurement.id, measurement);
    },
    async listBySeries(seriesId) {
      return [...byId.values()]
        .filter((m) => m.seriesId === seriesId)
        .sort((a, b) => (a.arrivalPosition ?? Infinity) - (b.arrivalPosition ?? Infinity));
    },
    async listByAthleteEvent(athleteId, { stroke, distance, pool }) {
      return [...byId.values()]
        .filter((m) => m.athleteId === athleteId && m.stroke === stroke && m.distance === distance && m.pool === pool)
        .sort((a, b) => (a.capturedAt === b.capturedAt ? a.id.localeCompare(b.id) : b.capturedAt.localeCompare(a.capturedAt)));
    },
  };
}
