import { assertEditableTime, type Measurement, type MeasurementRepository } from './measurements';

export function createInMemoryMeasurementRepository(): MeasurementRepository {
  const byId = new Map<string, Measurement>();
  return {
    async add(measurement) {
      byId.set(measurement.id, measurement);
    },
    async edit(id, { hundredths, athleteId }, { editReason }) {
      const stored = byId.get(id);
      if (!stored) throw new Error(`Cannot edit measurement ${id}: it is not stored`);
      assertEditableTime(stored.kind, hundredths);
      // The server bumps the version and stamps the author and time once it applies the edit: here only the edit itself shows.
      byId.set(id, {
        ...stored,
        ...(hundredths !== undefined && { hundredths }),
        ...(athleteId !== undefined && { athleteId }),
        editReason: editReason ?? null,
      } as Measurement);
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
