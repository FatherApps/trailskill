import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import { db, writeBatch } from '../../../core/sync';
import type { InMemoryMeasurementRepository } from './inMemoryMeasurementRepository';
import { DiscardedMeasurementError, type Measurement, type SessionType } from './measurements';
import { createPowerSyncMeasurementRepository, measurementRow } from './powerSyncMeasurementRepository';

/** A series of athletes who start together: one row, and the arrivals are its measurements. */
export type SeriesRecord = {
  id: string;
  createdBy: string;
  schoolId: string;
  deviceId: string;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  sessionType: SessionType;
};

/** A series with arrivals still waiting for their athlete ("por asignar"): enough to name it and to reopen its assignment. */
export type PendingSeries = {
  seriesId: string;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  sessionType: SessionType;
  /** The latest capture among the arrivals still waiting. */
  capturedAt: string;
  /** How many arrivals of the series have no athlete and are not discarded. */
  pending: number;
};

export interface SeriesRepository {
  /** Opens the series: its row and its first arrival in one transaction, so no arrival can upload before its series. */
  open(series: SeriesRecord, first: Measurement): Promise<void>;
  /** Saves one more arrival of an open series on the phone, in its own transaction, the moment it is pressed. */
  addArrival(arrival: Measurement): Promise<void>;
  /**
   * "Deshacer última": marks the arrival as discarded by its author. The row stays, marked, and every read leaves it out;
   * the server accepts it once, only for the author's own unassigned series arrival. An arrival not on the phone is left alone.
   */
  discardArrival(id: string, discardedBy: string): Promise<void>;
  /**
   * Gives saved arrivals their athletes; the arrivals not listed stay "por asignar". All or nothing on the phone: a discarded
   * arrival rejects with DiscardedMeasurementError and a missing one rejects, in both cases without changing any arrival.
   */
  assign(assignments: { id: string; athleteId: string }[], meta: { deviceId: string }): Promise<void>;
  /** The arrivals of a series that are not discarded, by arrival position (assigned or not). */
  listArrivals(seriesId: string): Promise<Measurement[]>;
  /**
   * The series of one school with arrivals still waiting for an athlete, newest first: what "Series por asignar" shows, even in another app session.
   * Another school's series are left out: naming them with this school's roster would be refused for good by the server.
   */
  listPending(schoolId: string): Promise<PendingSeries[]>;
}

type PendingRow = {
  series_id: string;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  session_type: SessionType;
  captured_at: string;
  pending: number;
};

export function createPowerSyncSeriesRepository(): SeriesRepository {
  const measurements = createPowerSyncMeasurementRepository();
  return {
    async open(series, first) {
      await writeBatch(async (batch) => {
        await batch.write('timing_series', {
          id: series.id,
          created_by: series.createdBy,
          school_id: series.schoolId,
          device_id: series.deviceId,
          stroke: series.stroke,
          distance: series.distance,
          pool: series.pool,
          session_type: series.sessionType,
        });
        await batch.write('measurements', measurementRow(first));
      });
    },
    addArrival: (arrival) => measurements.add(arrival),
    discardArrival: (id, discardedBy) => measurements.discard(id, discardedBy),
    async assign(assignments, meta) {
      if (assignments.length === 0) return;
      await writeBatch(async (batch) => {
        // The ids travel as one JSON parameter, like the other reads. A missing id is rejected by batch.edit.
        const discarded = await batch.getAll<{ id: string }>(
          'SELECT id FROM measurements WHERE id IN (SELECT value FROM json_each(?)) AND discarded_at IS NOT NULL',
          [JSON.stringify(assignments.map(({ id }) => id))],
        );
        // The server would refuse it for good (a permanent upload failure), so nothing is written.
        if (discarded.length > 0) throw new DiscardedMeasurementError('A discarded arrival cannot change');
        for (const { id, athleteId } of assignments) {
          // The same metadata PowerSyncMeasurementRepository.edit sends.
          await batch.edit('measurements', id, { athlete_id: athleteId }, { edited_device_id: meta.deviceId, edit_reason: null });
        }
      });
    },
    listArrivals: (seriesId) => measurements.listBySeries(seriesId),
    async listPending(schoolId) {
      // The local database only holds the author's own unassigned arrivals (sync rules), so no filter by user is needed.
      // julianday compares moments: synced rows may use a space instead of 'T' between date and time.
      const rows = await db.getAll<PendingRow>(
        `SELECT series_id, stroke, distance, pool, session_type, MAX(captured_at) AS captured_at, COUNT(*) AS pending
         FROM measurements
         WHERE series_id IS NOT NULL AND athlete_id IS NULL AND discarded_at IS NULL AND school_id = ?
         GROUP BY series_id, stroke, distance, pool, session_type
         ORDER BY MAX(julianday(captured_at)) DESC, series_id`,
        [schoolId],
      );
      return rows.map((row) => ({
        seriesId: row.series_id,
        stroke: row.stroke,
        distance: row.distance,
        pool: row.pool,
        sessionType: row.session_type,
        capturedAt: row.captured_at,
        pending: row.pending,
      }));
    },
  };
}

// The measurements are the only thing the fake keeps: the series row has no reader yet.
export function createInMemorySeriesRepository(measurements: InMemoryMeasurementRepository): SeriesRepository {
  return {
    open: (_series, first) => measurements.add(first),
    addArrival: (arrival) => measurements.add(arrival),
    discardArrival: (id, discardedBy) => measurements.discard(id, discardedBy),
    async assign(assignments, meta) {
      measurements.assertEditable(assignments.map(({ id }) => id));
      for (const { id, athleteId } of assignments) await measurements.edit(id, { athleteId }, meta);
    },
    listArrivals: (seriesId) => measurements.listBySeries(seriesId),
    async listPending(schoolId) {
      const groups = new Map<string, PendingSeries>();
      for (const m of await measurements.listUnassigned()) {
        if (m.schoolId !== schoolId) continue;
        const group = groups.get(m.seriesId!);
        if (!group) {
          groups.set(m.seriesId!, {
            seriesId: m.seriesId!,
            stroke: m.stroke,
            distance: m.distance,
            pool: m.pool,
            sessionType: m.sessionType,
            capturedAt: m.capturedAt,
            pending: 1,
          });
        } else {
          group.pending += 1;
          if (Date.parse(m.capturedAt) > Date.parse(group.capturedAt)) group.capturedAt = m.capturedAt;
        }
      }
      return [...groups.values()].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt) || a.seriesId.localeCompare(b.seriesId));
    },
  };
}
