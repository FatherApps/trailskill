import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import { writeBatch } from '../../../core/sync';
import type { InMemoryMeasurementRepository } from './inMemoryMeasurementRepository';
import { type Measurement, type SessionType } from './measurements';
import { createPowerSyncMeasurementRepository, measurementRow } from './powerSyncMeasurementRepository';

/** A series of athletes who start together: one row, and the arrivals are its measurements. */
export type SeriesRecord = {
  id: string;
  createdBy: string;
  deviceId: string;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  sessionType: SessionType;
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
  /** Gives saved arrivals their athletes; the arrivals not listed stay "por asignar". */
  assign(assignments: { id: string; athleteId: string }[], meta: { deviceId: string }): Promise<void>;
}

export function createPowerSyncSeriesRepository(): SeriesRepository {
  const measurements = createPowerSyncMeasurementRepository();
  return {
    async open(series, first) {
      await writeBatch(async (batch) => {
        await batch.write('timing_series', {
          id: series.id,
          created_by: series.createdBy,
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
    async discardArrival(id, discardedBy) {
      await writeBatch(async (batch) => {
        // writeRecord would insert a row that is not there: a discard of a missing arrival must change nothing.
        const [stored] = await batch.getAll('SELECT 1 FROM measurements WHERE id = ?', [id]);
        if (stored) await batch.write('measurements', { id, discarded_at: new Date().toISOString(), discarded_by: discardedBy });
      });
    },
    async assign(assignments, meta) {
      for (const { id, athleteId } of assignments) await measurements.edit(id, { athleteId }, meta);
    },
  };
}

// The measurements are the only thing the fake keeps: the series row has no reader yet.
export function createInMemorySeriesRepository(measurements: InMemoryMeasurementRepository): SeriesRepository {
  return {
    open: (_series, first) => measurements.add(first),
    addArrival: (arrival) => measurements.add(arrival),
    discardArrival: (id) => measurements.discard(id),
    async assign(assignments, meta) {
      for (const { id, athleteId } of assignments) await measurements.edit(id, { athleteId }, meta);
    },
  };
}
