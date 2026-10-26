import type { Hundredths } from '../../../core/time';
import { supabase } from '../../../core/sync';

// One side of a conflict: a time (`null` is a missing time, never 0) and who captured it, on which device, when (ISO 8601).
export type ConflictVersion = { hundredths: Hundredths | null; author: string | null; device: string | null; at: string };

export type OpenConflict = {
  id: string;
  // The measurement's live version; the server rejects the resolution when the measurement changed since it was read.
  expectedVersion: number;
  athleteName: string | null;
  // Sport catalog codes, worded by the screen.
  event: { stroke: string; distance: string; pool: string };
  current: ConflictVersion;
  incoming: ConflictVersion;
};

export type ConflictDecision = 'current' | 'incoming' | 'value';
export type ResolveConflictInput = {
  conflictId: string;
  expectedVersion: number;
  decision: ConflictDecision;
  // Only with `value`; `null` stores a missing time.
  hundredths: Hundredths | null;
  reason: string;
};

// forbidden: not a platform admin. stale: the measurement changed, reload. resolved: someone else resolved it first.
// offline: no signal, nothing was sent. failed: any other rejection.
export type ConflictFailure = 'forbidden' | 'stale' | 'resolved' | 'offline' | 'failed';

export class ConflictReviewError extends Error {
  constructor(readonly reason: ConflictFailure) {
    super(`conflict review failed: ${reason}`);
  }
}

export interface ConflictReviewRepository {
  /** Online: whether the user is a platform admin. Throws when the request fails. */
  isPlatformAdmin(userId: string): Promise<boolean>;
  /** Online: the open conflicts, oldest first. Throws ConflictReviewError. */
  listOpen(): Promise<OpenConflict[]>;
  /** Online: resolves one conflict on the server and keeps both versions. Throws ConflictReviewError. */
  resolve(input: ResolveConflictInput): Promise<void>;
}

// A PostgREST error plus the HTTP status of its response (0 when the request never reached the server).
export function classifyResolveError(error: { code?: string }, status: number | undefined): ConflictFailure {
  if (error.code === '42501') return 'forbidden';
  if (error.code === 'PT409' || status === 409) return 'stale';
  if (error.code === '55000') return 'resolved';
  if (!error.code && !status) return 'offline';
  return 'failed';
}

type Row = Record<string, any>;
type ValuesJson = { hundredths?: number | null } | null;
const fullName = (row: Row | undefined) => (row ? `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || null : null);

export function createSupabaseConflictReviewRepository(): ConflictReviewRepository {
  // Reads a table through REST; the policies decide what a platform admin sees.
  async function read(table: string, columns: string, filter?: { column: string; values: string[] }): Promise<Row[]> {
    if (filter && filter.values.length === 0) return [];
    let query = supabase.from(table).select(columns);
    if (filter) query = query.in(filter.column, filter.values);
    const { data, error, status } = await query;
    if (error) throw new ConflictReviewError(classifyResolveError(error, status));
    return (data ?? []) as unknown as Row[];
  }
  const ids = (rows: Row[], key: string) => [...new Set(rows.map((row) => row[key]).filter((value): value is string => typeof value === 'string'))];

  return {
    async isPlatformAdmin(userId) {
      const { data, error } = await supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async listOpen() {
      const { data, error, status } = await supabase
        .from('measurement_conflicts')
        .select('id, measurement_id, current_values, current_by, current_device, current_at, incoming_values, incoming_by, incoming_device, incoming_at')
        .eq('status', 'open')
        .order('created_at', { ascending: true });
      if (error) throw new ConflictReviewError(classifyResolveError(error, status));
      const conflicts = (data ?? []) as Row[];
      const measurements = await read('measurements', 'id, version, athlete_id, stroke, distance, pool', {
        column: 'id',
        values: ids(conflicts, 'measurement_id'),
      });
      const measurementById = new Map(measurements.map((row) => [row.id, row]));
      const athletes = await read('athletes', 'id, first_name, last_name', { column: 'id', values: ids(measurements, 'athlete_id') });
      // Author names are best effort: a profile the admin cannot read leaves the author unknown.
      const authors = await read('adult_profiles', 'user_id, first_name, last_name', {
        column: 'user_id',
        values: [...new Set([...ids(conflicts, 'current_by'), ...ids(conflicts, 'incoming_by')])],
      }).catch(() => []);
      const athleteById = new Map(athletes.map((row) => [row.id, row]));
      const authorById = new Map(authors.map((row) => [row.user_id, row]));
      const hundredths = (values: ValuesJson) => (typeof values?.hundredths === 'number' ? values.hundredths : null);

      return conflicts.flatMap((row): OpenConflict[] => {
        const measurement = measurementById.get(row.measurement_id);
        // A measurement this admin cannot read cannot be resolved against its live version either.
        if (!measurement) return [];
        return [
          {
            id: row.id,
            expectedVersion: measurement.version,
            athleteName: fullName(athleteById.get(measurement.athlete_id)),
            event: { stroke: measurement.stroke, distance: measurement.distance, pool: measurement.pool },
            current: { hundredths: hundredths(row.current_values), author: fullName(authorById.get(row.current_by)), device: row.current_device ?? null, at: row.current_at },
            incoming: { hundredths: hundredths(row.incoming_values), author: fullName(authorById.get(row.incoming_by)), device: row.incoming_device ?? null, at: row.incoming_at },
          },
        ];
      });
    },
    async resolve({ conflictId, expectedVersion, decision, hundredths, reason }) {
      let result;
      try {
        result = await supabase.rpc('resolve_measurement_conflict', {
          conflict_id: conflictId,
          expected_version: expectedVersion,
          decision,
          hundredths: decision === 'value' ? hundredths : null,
          reason,
        });
      } catch {
        // supabase-js throws only when the request itself fails, without a response.
        throw new ConflictReviewError('offline');
      }
      if (result.error) throw new ConflictReviewError(classifyResolveError(result.error, result.status));
    },
  };
}

export function createInMemoryConflictReviewRepository(options: { conflicts?: OpenConflict[]; admins?: string[]; offline?: boolean } = {}) {
  let open = [...(options.conflicts ?? [])];
  const repository = {
    resolved: [] as ResolveConflictInput[],
    offline: options.offline ?? false,
    // Rejects every resolve with this reason, like the server would.
    rejectWith: undefined as ConflictFailure | undefined,
    async isPlatformAdmin(userId: string) {
      return (options.admins ?? []).includes(userId);
    },
    async listOpen() {
      if (repository.offline) throw new ConflictReviewError('offline');
      return [...open];
    },
    async resolve(input: ResolveConflictInput) {
      if (repository.offline) throw new ConflictReviewError('offline');
      if (repository.rejectWith) throw new ConflictReviewError(repository.rejectWith);
      repository.resolved.push({ ...input });
      open = open.filter((conflict) => conflict.id !== input.conflictId);
    },
  };
  return repository;
}
