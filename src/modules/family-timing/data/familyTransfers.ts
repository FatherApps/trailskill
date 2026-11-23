import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import { db, supabase } from '../../../core/sync';
import type { Millis } from '../../../core/time';
import { parseSplitMeters, type FamilySessionType } from './familyMeasurements';

/**
 * A time a guardian sent to another swimmer's family with the swimmer's share code (#973). While it waits, the time stays the
 * sender's, under "Sin asignar". Accepted, it becomes the receiving family's; rejected, withdrawn or 30 days old, it stays the sender's.
 */
export type FamilyTransfer = {
  id: string;
  measurementId: string;
  fromUserId: string;
  athleteId: string;
  // What the sender saw of the swimmer ("Ana M."); nothing else of them reaches the sender.
  athleteShortName: string;
  createdAt: string;
  expiresAt: string;
  // The time as it was sent: the receiving family cannot read the sender's times.
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  sessionType: FamilySessionType;
  competition: string | null;
  capturedAt: string;
  millis: Millis | null;
  splits: Millis[];
  // The meters of each mark as they were sent; null for a time saved before free laps.
  splitMeters?: (number | null)[] | null;
};

export type FamilyTransferErrorCode =
  | 'unknown_code'
  | 'own_athlete'
  | 'already_sent'
  | 'too_many_attempts'
  | 'request_closed'
  | 'deleted_time'
  | 'failed';

/** Why the server did not send or answer; `failed` is anything else, for example no signal. */
export class FamilyTransferError extends Error {
  override name = 'FamilyTransferError';
  constructor(readonly code: FamilyTransferErrorCode) {
    super(code);
  }
}

export interface FamilyTransferRepository {
  /** Online: sends the time to the swimmer with that code. Returns the swimmer's short name. */
  send(measurementId: string, code: string): Promise<string>;
  /** Online: the swimmer's family takes the time; it becomes theirs, for that swimmer. */
  accept(transferId: string): Promise<void>;
  /** Online: the swimmer's family does not take it; it stays the sender's. */
  reject(transferId: string): Promise<void>;
  /** Online: the sender takes the request back before it is answered. */
  withdraw(transferId: string): Promise<void>;
  /** The user's requests still waiting for an answer. */
  listSent(userId: string, now: string): Promise<FamilyTransfer[]>;
  /** The requests still waiting for the swimmer's family to answer, oldest first. */
  listReceived(athleteId: string, now: string): Promise<FamilyTransfer[]>;
}

const KNOWN: FamilyTransferErrorCode[] = ['unknown_code', 'own_athlete', 'already_sent', 'too_many_attempts', 'request_closed', 'deleted_time'];
const transferError = (error: { message?: string }) =>
  new FamilyTransferError(KNOWN.find((code) => code === error.message) ?? 'failed');

async function rpc<T>(name: string, args: Record<string, string>): Promise<T> {
  let result: { data: unknown; error: { message?: string } | null };
  try {
    result = await supabase.rpc(name, args);
  } catch {
    throw new FamilyTransferError('failed');
  }
  if (result.error) throw transferError(result.error);
  return result.data as T;
}

type Row = {
  id: string;
  measurement_id: string;
  from_user_id: string;
  athlete_id: string;
  athlete_short_name: string;
  created_at: string;
  expires_at: string;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode;
  session_type: FamilySessionType;
  competition: string | null;
  captured_at: string;
  millis: number | null;
  splits: string | null;
  split_meters?: string | null;
};

function parseSplits(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === 'number') : [];
  } catch {
    return [];
  }
}

const toTransfer = (row: Row): FamilyTransfer => ({
  id: row.id,
  measurementId: row.measurement_id,
  fromUserId: row.from_user_id,
  athleteId: row.athlete_id,
  athleteShortName: row.athlete_short_name,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  stroke: row.stroke,
  distance: row.distance,
  pool: row.pool,
  sessionType: row.session_type,
  competition: row.competition,
  capturedAt: row.captured_at,
  millis: row.millis,
  splits: parseSplits(row.splits),
  splitMeters: parseSplitMeters(row.split_meters),
});

// The answers go to the server functions; the requests reach the device by sync (family_timing_transfers).
export function createPowerSyncFamilyTransferRepository(): FamilyTransferRepository {
  return {
    async send(measurementId, code) {
      // The server answers an unknown code with null, not an error, so that the failed attempt counts (#1013).
      const shortName = await rpc<string | null>('send_family_time', { measurement: measurementId, share_code: code });
      if (shortName === null) throw new FamilyTransferError('unknown_code');
      return shortName;
    },
    accept: (transferId) => rpc<void>('accept_family_time', { transfer: transferId }),
    reject: (transferId) => rpc<void>('reject_family_time', { transfer: transferId }),
    withdraw: (transferId) => rpc<void>('withdraw_family_time', { transfer: transferId }),
    async listSent(userId, now) {
      const rows = await db.getAll<Row>(
        `SELECT * FROM family_timing_transfers WHERE from_user_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at`,
        [userId, now],
      );
      return rows.map(toTransfer);
    },
    async listReceived(athleteId, now) {
      const rows = await db.getAll<Row>(
        `SELECT * FROM family_timing_transfers WHERE athlete_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at`,
        [athleteId, now],
      );
      return rows.map(toTransfer);
    },
  };
}

type Stored = FamilyTransfer & { status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' };

/**
 * For tests: a request goes from `send` to the receiving side at once, as if synced. `codes` maps a share code to a swimmer and its
 * short name; `onAccept` lets a test move the time between its repositories, as the server does.
 */
export function createInMemoryFamilyTransferRepository(options: {
  codes?: Record<string, { athleteId: string; shortName: string }>;
  ownAthleteIds?: string[];
  measurements?: (id: string) => Omit<FamilyTransfer, 'id' | 'measurementId' | 'fromUserId' | 'athleteId' | 'athleteShortName' | 'createdAt' | 'expiresAt'> | undefined;
  userId?: string;
  onAccept?: (transfer: FamilyTransfer) => void | Promise<void>;
  failing?: boolean;
  initial?: Stored[];
} = {}) {
  const rows = new Map<string, Stored>((options.initial ?? []).map((t) => [t.id, t]));
  let made = 0;
  const open = (now: string) => [...rows.values()].filter((t) => t.status === 'pending' && t.expiresAt > now);
  const answer = async (id: string, status: Stored['status']) => {
    if (options.failing) throw new FamilyTransferError('failed');
    const row = rows.get(id);
    if (!row || row.status !== 'pending' || row.expiresAt <= new Date().toISOString()) throw new FamilyTransferError('request_closed');
    rows.set(id, { ...row, status });
    return row;
  };
  const repository: FamilyTransferRepository & { rows: Map<string, Stored> } = {
    rows,
    async send(measurementId, code) {
      if (options.failing) throw new FamilyTransferError('failed');
      const target = options.codes?.[code.trim().toUpperCase()];
      if (!target) throw new FamilyTransferError('unknown_code');
      if (options.ownAthleteIds?.includes(target.athleteId)) throw new FamilyTransferError('own_athlete');
      if ([...rows.values()].some((t) => t.measurementId === measurementId && t.status === 'pending')) throw new FamilyTransferError('already_sent');
      const time = options.measurements?.(measurementId);
      if (!time) throw new FamilyTransferError('failed');
      const createdAt = new Date().toISOString();
      const id = `transfer-${++made}`;
      rows.set(id, {
        ...time,
        id,
        measurementId,
        fromUserId: options.userId ?? 'u1',
        athleteId: target.athleteId,
        athleteShortName: target.shortName,
        createdAt,
        expiresAt: new Date(Date.parse(createdAt) + 30 * 86_400_000).toISOString(),
        status: 'pending',
      });
      return target.shortName;
    },
    async accept(id) {
      const row = await answer(id, 'accepted');
      await options.onAccept?.(row);
    },
    async reject(id) {
      await answer(id, 'rejected');
    },
    async withdraw(id) {
      await answer(id, 'withdrawn');
    },
    async listSent(userId, now) {
      return open(now).filter((t) => t.fromUserId === userId);
    },
    async listReceived(athleteId, now) {
      return open(now).filter((t) => t.athleteId === athleteId);
    },
  };
  return repository;
}
