import { assertEditableTime, DiscardedMeasurementError, type Measurement, type MeasurementRepository } from './measurements';

const newestFirst = (a: Measurement, b: Measurement) =>
  a.capturedAt === b.capturedAt ? a.id.localeCompare(b.id) : b.capturedAt.localeCompare(a.capturedAt);

export type InMemoryMeasurementRepository = MeasurementRepository & {
  /** The arrivals of a series that have no athlete yet (individual times never), by id. */
  listUnassigned(): Promise<Measurement[]>;
  /** Throws, changing nothing, when an id is missing or discarded: lets a caller check a whole batch before editing any of it. */
  assertEditable(ids: readonly string[]): void;
};

export function createInMemoryMeasurementRepository(): InMemoryMeasurementRepository {
  const byId = new Map<string, Measurement>();
  const discarded = new Set<string>();
  const live = () => [...byId.values()].filter((m) => !discarded.has(m.id));
  function assertEditable(ids: readonly string[]) {
    for (const id of ids) {
      if (!byId.has(id)) throw new Error(`Cannot edit measurement ${id}: it is not stored`);
      if (discarded.has(id)) throw new DiscardedMeasurementError('A discarded arrival cannot change');
    }
  }
  return {
    async add(measurement) {
      byId.set(measurement.id, measurement);
    },
    // The row stays stored, like the real repository: no read returns it. Who discarded it is not kept here.
    async discard(id) {
      if (byId.has(id)) discarded.add(id);
    },
    assertEditable,
    async listUnassigned() {
      return live()
        .filter((m) => m.athleteId === null && m.seriesId !== null)
        .sort((a, b) => a.id.localeCompare(b.id));
    },
    async edit(id, { hundredths, athleteId }, { editReason }) {
      assertEditable([id]);
      const current = byId.get(id)!;
      assertEditableTime(current.kind, hundredths);
      // The server bumps the version and stamps the author and time once it applies the edit: here only the edit itself shows.
      byId.set(id, {
        ...current,
        ...(hundredths !== undefined && { hundredths }),
        ...(athleteId !== undefined && { athleteId }),
        editReason: editReason ?? null,
      } as Measurement);
    },
    async listBySeries(seriesId) {
      return live()
        .filter((m) => m.seriesId === seriesId)
        .sort((a, b) => (a.arrivalPosition ?? Infinity) - (b.arrivalPosition ?? Infinity));
    },
    async listByAthleteEvent(athleteId, { stroke, distance, pool }) {
      return live()
        .filter((m) => m.athleteId === athleteId && m.stroke === stroke && m.distance === distance && m.pool === pool)
        .sort(newestFirst);
    },
    async listByAthletesEvent(athleteIds, { stroke, distance, pool }) {
      const wanted = new Set(athleteIds);
      return live()
        .filter((m) => m.athleteId !== null && wanted.has(m.athleteId) && m.stroke === stroke && m.distance === distance && m.pool === pool)
        .sort(newestFirst);
    },
    async listByAthlete(athleteId) {
      return live().filter((m) => m.athleteId === athleteId).sort(newestFirst);
    },
    async listBySchool(schoolId) {
      return live().filter((m) => m.schoolId === schoolId && m.athleteId !== null).sort(newestFirst);
    },
    async countCapturedSince(athleteIds, since) {
      const wanted = new Set(athleteIds);
      return live().filter((m) => m.athleteId !== null && wanted.has(m.athleteId) && Date.parse(m.capturedAt) >= Date.parse(since)).length;
    },
  };
}
