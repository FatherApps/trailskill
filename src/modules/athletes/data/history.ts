import type { Measurement } from '../../timing';
import type { EventValue } from '../components/EventSelector';
import type { HistoryOrigin } from '../components/HistoryList';

/** A measurement of the athlete plus where it came from; keeps the id, so its sync state can be queried. */
export type HistoryMeasurement = Measurement & { origin: HistoryOrigin };

export interface HistoryRepository {
  /** Every kind of measurement of the athlete in the event, newest first. Reads the local database only. */
  listByEvent(athleteId: string, event: EventValue): Promise<HistoryMeasurement[]>;
  /** Every measurement of the athlete in every event, newest first (by id on a tie). Reads the local database only. */
  listByAthlete(athleteId: string): Promise<HistoryMeasurement[]>;
}
