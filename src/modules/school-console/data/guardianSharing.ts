import { supabase } from '../../../core/sync';
import type { Hundredths } from '../../../core/time';
import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import type { MeasurementKind, MeasurementRepository } from '../../timing';

// The school chooses what a guardian sees of the school's times (docs/product/guardian-shared-school-times.md). Only staff of the school
// may read or change it: the server refuses everyone else (42501), so hiding the controls is never the protection.
export interface GuardianSharingRepository {
  /** The school's default for a swimmer without a switch of their own. `false` (do not share) when the school never chose. */
  getSchoolDefault(schoolId: string): Promise<boolean>;
  /** Changes the default for new swimmers. Swimmers who already exist keep the value they had. */
  setSchoolDefault(schoolId: string, sharesAll: boolean): Promise<void>;
  /** Whether all the school's times of the swimmer are shared with the guardian: their own switch, else the school's default. */
  getSwimmer(athleteId: string, schoolId: string): Promise<boolean>;
  setSwimmer(athleteId: string, schoolId: string, sharesAll: boolean): Promise<void>;
  /** Shares or stops sharing one record of a swimmer. Rows from before the rule stay visible whatever this says. */
  setRecordShared(measurementId: string, shared: boolean): Promise<void>;
}

/** Why a change was not made: the SQLSTATE the server answered (`42501` no permission, `40P01` deadlock) or `unexpected`. Never the server's message, which can name a swimmer. */
export class GuardianSharingError extends Error {
  constructor(readonly code: string) {
    super(`The guardian sharing request failed (${code})`);
    this.name = 'GuardianSharingError';
  }
}

export function createInMemoryGuardianSharingRepository(): GuardianSharingRepository {
  let schoolDefault = false;
  const swimmers = new Map<string, boolean>();
  const records = new Map<string, boolean>();
  return {
    async getSchoolDefault() {
      return schoolDefault;
    },
    async setSchoolDefault(_schoolId, sharesAll) {
      schoolDefault = sharesAll;
    },
    async getSwimmer(athleteId, schoolId) {
      return swimmers.get(`${athleteId}:${schoolId}`) ?? schoolDefault;
    },
    async setSwimmer(athleteId, schoolId, sharesAll) {
      swimmers.set(`${athleteId}:${schoolId}`, sharesAll);
    },
    async setRecordShared(measurementId, shared) {
      records.set(measurementId, shared);
    },
  };
}

export type GuardianSharingClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const DEADLOCK = '40P01';
const TRIES = 3;
const BACKOFF_MS = 200;

// Postgres aborts one of two crossing changes with 40P01 and nothing ends wrong, so the same call is repeated, three tries in all,
// waiting a little longer each time. Any other failure is not repeated.
async function withDeadlockRetry(call: () => Promise<void>, delay: (ms: number) => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof GuardianSharingError) || error.code !== DEADLOCK || attempt === TRIES) throw error;
      await delay(BACKOFF_MS * attempt);
    }
  }
}

// The adapter over the RPC of the timing migration. `delay` is injectable so a test does not wait.
export function createSupabaseGuardianSharingRepository(
  client: GuardianSharingClient = supabase,
  delay: (ms: number) => Promise<void> = wait,
): GuardianSharingRepository {
  const call = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new GuardianSharingError(error.code || 'unexpected');
    return data;
  };
  return {
    async getSchoolDefault(schoolId) {
      return (await call('timing_guardian_sharing_default', { school: schoolId })) === true;
    },
    setSchoolDefault: (schoolId, sharesAll) =>
      withDeadlockRetry(async () => void (await call('timing_set_guardian_sharing_default', { school: schoolId, shares_all: sharesAll })), delay),
    async getSwimmer(athleteId, schoolId) {
      return (await call('timing_guardian_sharing', { athlete: athleteId, school: schoolId })) === true;
    },
    setSwimmer: (athleteId, schoolId, sharesAll) =>
      withDeadlockRetry(
        async () => void (await call('timing_set_guardian_sharing', { athlete: athleteId, school: schoolId, shares_all: sharesAll })),
        delay,
      ),
    async setRecordShared(measurementId, shared) {
      await call('timing_set_measurement_guardian_shared', { measurement: measurementId, shared });
    },
  };
}

// One school record of a swimmer, as the sharing list needs it.
export type GuardianRecord = {
  id: string;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  kind: MeasurementKind;
  time: Hundredths | null;
  // ISO 8601.
  capturedAt: string;
  // Whether the guardian reads it. `null`: this device does not know yet; the list never says shared or not shared then.
  shared: boolean | null;
};

export interface GuardianRecordsRepository {
  /** The swimmer's records written for the school, newest first, from the local database. Only a record of a swimmer, never an unassigned arrival. */
  list(athleteId: string, schoolId: string): Promise<GuardianRecord[]>;
}

export function createGuardianRecordsRepository(measurements: Pick<MeasurementRepository, 'listByAthlete'>): GuardianRecordsRepository {
  return {
    async list(athleteId, schoolId) {
      return (await measurements.listByAthlete(athleteId))
        .filter((m) => m.schoolId === schoolId)
        .map((m) => ({
          id: m.id,
          stroke: m.stroke,
          distance: m.distance,
          pool: m.pool,
          kind: m.kind,
          time: m.hundredths,
          capturedAt: m.capturedAt,
          shared: m.guardianVisible ?? null,
        }));
    },
  };
}
