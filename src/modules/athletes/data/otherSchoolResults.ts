import { supabase } from '../../../core/sync';
import type { EventValue } from '../components/EventSelector';
import type { HistoryMeasurement } from './history';

/** A result of another school: only what the history shows. No author, device, school, birth date or document. */
export type OtherSchoolResult = Pick<
  HistoryMeasurement,
  'id' | 'kind' | 'hundredths' | 'stroke' | 'distance' | 'pool' | 'sessionType' | 'capturedAt' | 'arrivalPosition'
>;

export interface OtherSchoolResultsRepository {
  /**
   * Results of the athlete in the event that another school may show, newest first. Asks the server every time and never stores
   * them on the device: not in the local database, not in a cache. Rejects on any error, offline included.
   */
  listByEvent(athleteId: string, event: EventValue): Promise<OtherSchoolResult[]>;
}

// The part of the Supabase client used here; tests pass a fake.
type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: Error | null }> };

type Row = {
  id: string;
  kind: OtherSchoolResult['kind'];
  hundredths: OtherSchoolResult['hundredths'];
  stroke: OtherSchoolResult['stroke'];
  distance: OtherSchoolResult['distance'];
  pool: OtherSchoolResult['pool'];
  session_type: OtherSchoolResult['sessionType'];
  captured_at: string;
  arrival_position: number | null;
};

export function createSupabaseOtherSchoolResultsRepository(client: RpcClient = supabase): OtherSchoolResultsRepository {
  return {
    async listByEvent(athleteId, { stroke, distance, pool }) {
      const { data, error } = await client.rpc('other_school_results', { athlete: athleteId });
      if (error) throw error;
      return ((data ?? []) as Row[])
        .filter((r) => r.stroke === stroke && r.distance === distance && r.pool === pool)
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          hundredths: r.hundredths,
          stroke: r.stroke,
          distance: r.distance,
          pool: r.pool,
          sessionType: r.session_type,
          // PostgREST sends '+00:00'; local rows use 'Z' and the history sorts by string.
          capturedAt: new Date(r.captured_at).toISOString(),
          arrivalPosition: r.arrival_position,
        }));
    },
  };
}

export function createInMemoryOtherSchoolResultsRepository(
  rows: (OtherSchoolResult & { athleteId: string })[],
): OtherSchoolResultsRepository {
  return {
    async listByEvent(athleteId, { stroke, distance, pool }) {
      return rows
        .filter((r) => r.athleteId === athleteId && r.stroke === stroke && r.distance === distance && r.pool === pool)
        .map(({ athleteId: _athleteId, ...result }) => result);
    },
  };
}
