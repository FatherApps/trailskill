import { supabase } from '../../../core/sync';

/** What the server answers to a family's request (see request_athlete_relink). A wrong key and an unknown one answer the same `invalid_key`. */
export type RelinkRequestResult = 'requested' | 'already_requested' | 'nothing_to_relink' | 'invalid_key' | 'rate_limited';

export type RelinkStatus = 'pending' | 'approved' | 'rejected';

/** A request of the family, as the family sees it: only the school and the state. */
export type RelinkRequest = {
  id: string;
  createdAt: string;
  status: RelinkStatus;
  schoolName: string;
  resolvedAt: string | null;
  movedCount: number | null;
};

/** A request in the inbox of a school. `timesCount` is what an approval would move now (0 once it is decided). */
export type SchoolRelinkRequest = {
  id: string;
  createdAt: string;
  status: RelinkStatus;
  athleteFirstName: string;
  athleteLastName: string;
  timesCount: number;
  resolvedAt: string | null;
  movedCount: number | null;
};

/** `already_resolved`: someone decided first and nothing changed. `no_longer_valid`: the family no longer manages the swimmer; closed as rejected. */
export type RelinkResolution = { status: 'approved' | 'rejected' | 'already_resolved' | 'no_longer_valid'; moved: number };

/**
 * Relinking the times a school kept for an erased swimmer (issue 1251). Online only, like the other server functions: nothing here is
 * stored on the device. Every method rejects with `not_allowed` when the server refuses the caller (not a manager of the swimmer, not an
 * active admin of the school) and with the original error for anything else, offline included.
 */
export interface AthleteRelinkRepository {
  /** The family asks with the key of the swimmer who was erased. The key is sent once and never kept. */
  request(athleteId: string, key: string): Promise<RelinkRequestResult>;
  /** The requests of a swimmer the caller manages, newest first. */
  listForAthlete(athleteId: string): Promise<RelinkRequest[]>;
  /** The inbox of a school the caller administers: pending first, then the newest. */
  listForSchool(schoolId: string): Promise<SchoolRelinkRequest[]>;
  /** The school approves (the times move to the swimmer of the family) or rejects (nothing moves). Deciding twice is harmless. */
  resolve(requestId: string, approve: boolean): Promise<RelinkResolution>;
}

// The part of the Supabase client used here; tests pass a fake.
type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: (Error & { code?: string }) | null }> };

type RequestRow = {
  id: string;
  created_at: string;
  status: RelinkStatus;
  school_name: string;
  resolved_at: string | null;
  moved_count: number | null;
};

type SchoolRow = {
  id: string;
  created_at: string;
  status: RelinkStatus;
  athlete_first_name: string;
  athlete_last_name: string;
  times_count: number;
  resolved_at: string | null;
  moved_count: number | null;
};

// 42501: the database refused the caller.
function fail(error: Error & { code?: string }): never {
  throw error.code === '42501' ? new Error('not_allowed') : error;
}

export function createSupabaseAthleteRelinkRepository(client: RpcClient = supabase): AthleteRelinkRepository {
  return {
    async request(athleteId, key) {
      const { data, error } = await client.rpc('request_athlete_relink', { p_athlete: athleteId, p_key: key });
      if (error) fail(error);
      return data as RelinkRequestResult;
    },
    async listForAthlete(athleteId) {
      const { data, error } = await client.rpc('athlete_relink_requests_for_manager', { p_athlete: athleteId });
      if (error) fail(error);
      return ((data ?? []) as RequestRow[]).map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        status: r.status,
        schoolName: r.school_name,
        resolvedAt: r.resolved_at,
        movedCount: r.moved_count,
      }));
    },
    async listForSchool(schoolId) {
      const { data, error } = await client.rpc('school_relink_requests', { p_school: schoolId });
      if (error) fail(error);
      return ((data ?? []) as SchoolRow[]).map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        status: r.status,
        athleteFirstName: r.athlete_first_name,
        athleteLastName: r.athlete_last_name,
        timesCount: r.times_count,
        resolvedAt: r.resolved_at,
        movedCount: r.moved_count,
      }));
    },
    async resolve(requestId, approve) {
      const { data, error } = await client.rpc('resolve_athlete_relink', { p_request: requestId, p_approve: approve });
      if (error) fail(error);
      const { status, moved } = data as { status: RelinkResolution['status']; moved?: number };
      return { status, moved: moved ?? 0 };
    },
  };
}

/** What the in-memory repository knows of one erased swimmer: the key and, per school, the times it kept. */
export type InMemoryRelinkMarker = { key: string; schools: { schoolId: string; schoolName: string; times: number }[] };

export type InMemoryRelinkWorld = {
  markers: InMemoryRelinkMarker[];
  /** The swimmers the caller manages, with their names. */
  managed: { athleteId: string; firstName: string; lastName: string }[];
  /** The schools the caller administers (active admin). */
  adminSchoolIds: string[];
};

// PROVISIONAL, like the server's: wrong keys per swimmer.
const IN_MEMORY_ATTEMPT_LIMIT = 5;

const normalizeKey = (key: string) => key.replace(/[\s-]/g, '').toUpperCase();

// The same rules as the server functions, over plain arrays, so screens and containers can be tested without a database.
export function createInMemoryAthleteRelinkRepository(world: InMemoryRelinkWorld): AthleteRelinkRepository {
  type Row = { id: string; athleteId: string; markerKey: string; schoolId: string; schoolName: string; times: number } & Omit<RelinkRequest, 'id' | 'schoolName'>;
  const rows: Row[] = [];
  const failed = new Map<string, number>();
  let next = 1;
  const manages = (athleteId: string) => world.managed.some((m) => m.athleteId === athleteId);

  return {
    async request(athleteId, key) {
      if (!manages(athleteId)) throw new Error('not_allowed');
      if ((failed.get(athleteId) ?? 0) >= IN_MEMORY_ATTEMPT_LIMIT) return 'rate_limited';
      const marker = world.markers.find((m) => normalizeKey(m.key) === normalizeKey(key) && /^[0-9A-F]{20}$/.test(normalizeKey(key)));
      if (!marker) {
        failed.set(athleteId, (failed.get(athleteId) ?? 0) + 1);
        return 'invalid_key';
      }
      const owners = marker.schools.filter((s) => s.times > 0);
      if (owners.length === 0) return 'nothing_to_relink';
      let created = 0;
      for (const s of owners) {
        if (rows.some((r) => r.athleteId === athleteId && r.markerKey === marker.key && r.schoolId === s.schoolId && r.status === 'pending')) continue;
        rows.push({
          id: `relink-${next++}`,
          athleteId,
          markerKey: marker.key,
          schoolId: s.schoolId,
          schoolName: s.schoolName,
          times: s.times,
          createdAt: new Date().toISOString(),
          status: 'pending',
          resolvedAt: null,
          movedCount: null,
        });
        created += 1;
      }
      return created > 0 ? 'requested' : 'already_requested';
    },
    async listForAthlete(athleteId) {
      if (!manages(athleteId)) return [];
      return rows
        .filter((r) => r.athleteId === athleteId)
        .map(({ id, createdAt, status, schoolName, resolvedAt, movedCount }) => ({ id, createdAt, status, schoolName, resolvedAt, movedCount }))
        .reverse();
    },
    async listForSchool(schoolId) {
      if (!world.adminSchoolIds.includes(schoolId)) throw new Error('not_allowed');
      return rows
        .filter((r) => r.schoolId === schoolId)
        .map((r) => {
          const who = world.managed.find((m) => m.athleteId === r.athleteId);
          return {
            id: r.id,
            createdAt: r.createdAt,
            status: r.status,
            athleteFirstName: who?.firstName ?? '',
            athleteLastName: who?.lastName ?? '',
            timesCount: r.status === 'pending' ? r.times : 0,
            resolvedAt: r.resolvedAt,
            movedCount: r.movedCount,
          };
        })
        .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
    },
    async resolve(requestId, approve) {
      const row = rows.find((r) => r.id === requestId);
      if (!row || !world.adminSchoolIds.includes(row.schoolId)) throw new Error('not_allowed');
      if (row.status !== 'pending') return { status: 'already_resolved', moved: 0 };
      const moved = approve ? row.times : 0;
      row.status = approve ? 'approved' : 'rejected';
      row.resolvedAt = new Date().toISOString();
      row.movedCount = moved;
      if (approve) {
        const school = world.markers.find((m) => m.key === row.markerKey)?.schools.find((s) => s.schoolId === row.schoolId);
        if (school) school.times = 0;
      }
      return { status: row.status, moved };
    },
  };
}
