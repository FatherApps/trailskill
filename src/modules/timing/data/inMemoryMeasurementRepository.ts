import { assertEditableTime, type Measurement, type MeasurementRepository } from './measurements';

const newestFirst = (a: Measurement, b: Measurement) =>
  a.capturedAt === b.capturedAt ? a.id.localeCompare(b.id) : b.capturedAt.localeCompare(a.capturedAt);

// The fake also drops a discarded arrival: the real one keeps the row marked as discarded and leaves it out of every read.
export type InMemoryMeasurementRepository = MeasurementRepository & { discard(id: string): Promise<void> };

export function createInMemoryMeasurementRepository(): InMemoryMeasurementRepository {
  const byId = new Map<string, Measurement>();
  return {
    async add(measurement) {
      byId.set(measurement.id, measurement);
    },
    async discard(id) {
      byId.delete(id);
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
        .sort(newestFirst);
    },
    async listByAthletesEvent(athleteIds, { stroke, distance, pool }) {
      const wanted = new Set(athleteIds);
      return [...byId.values()]
        .filter((m) => m.athleteId !== null && wanted.has(m.athleteId) && m.stroke === stroke && m.distance === distance && m.pool === pool)
        .sort(newestFirst);
    },
    async listByAthlete(athleteId) {
      return [...byId.values()].filter((m) => m.athleteId === athleteId).sort(newestFirst);
    },
    async countCapturedSince(athleteIds, since) {
      const wanted = new Set(athleteIds);
      return [...byId.values()].filter((m) => m.athleteId !== null && wanted.has(m.athleteId) && Date.parse(m.capturedAt) >= Date.parse(since)).length;
    },
  };
}
