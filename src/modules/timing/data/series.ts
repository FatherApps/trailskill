import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import { writeBatch } from '../../../core/sync';
import { type Measurement, type MeasurementRepository, type SessionType } from './measurements';
import { measurementRow } from './powerSyncMeasurementRepository';

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
  /** Saves the series with its arrivals, the ones without an athlete included ("por asignar" is never dropped). All of it or nothing. */
  save(series: SeriesRecord, arrivals: Measurement[]): Promise<void>;
}

export function createPowerSyncSeriesRepository(): SeriesRepository {
  return {
    async save(series, arrivals) {
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
        for (const arrival of arrivals) await batch.write('measurements', measurementRow(arrival));
      });
    },
  };
}

// The measurements are the only thing the fake keeps: the series row has no reader yet.
export function createInMemorySeriesRepository(measurements: MeasurementRepository): SeriesRepository {
  return {
    async save(_series, arrivals) {
      for (const arrival of arrivals) await measurements.add(arrival);
    },
  };
}
