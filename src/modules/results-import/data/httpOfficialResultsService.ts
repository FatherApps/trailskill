import { isDistance, isPool, isStroke } from '../../../core/sport';
import { supabase } from '../../../core/sync';
import type {
  FoundResult,
  IdentityStatus,
  ImportSummary,
  OfficialResultsError,
  OfficialResultsOutcome,
  OfficialResultsService,
} from './officialResults';

type Reply = { status: number; json(): Promise<unknown> };
type Dependencies = {
  url: string;
  accessToken(): Promise<string | null>;
  fetch(url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }): Promise<Reply>;
};

const UNAVAILABLE: OfficialResultsOutcome<never> = { ok: false, error: { code: 'unavailable' } };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const plainCodes = ['not_authorized', 'no_provider', 'unavailable', 'unknown_id', 'not_confirmed', 'identity_number_conflict', 'bad_request'];

function toError(raw: unknown): OfficialResultsError | null {
  if (!isRecord(raw) || typeof raw.code !== 'string') return null;
  if (raw.code === 'rate_limited') return typeof raw.retryAt === 'string' ? { code: 'rate_limited', retryAt: raw.retryAt } : null;
  return plainCodes.includes(raw.code) ? ({ code: raw.code } as OfficialResultsError) : null;
}

// Trust boundary: rebuild each result with only the contract's fields.
function toResult(raw: unknown): FoundResult | null {
  if (!isRecord(raw)) return null;
  const { id, stroke, distance, pool, hundredths, swumOn, competition } = raw;
  if (typeof id !== 'string' || !isStroke(stroke) || !isDistance(distance) || !isPool(pool)) return null;
  if (hundredths !== null && typeof hundredths !== 'number') return null;
  if (typeof swumOn !== 'string' || (competition !== null && typeof competition !== 'string')) return null;
  return { id, stroke, distance, pool, hundredths: hundredths as number | null, swumOn, competition: competition as string | null };
}

function toStatus(raw: unknown): IdentityStatus | null {
  if (!isRecord(raw) || typeof raw.confirmed !== 'boolean') return null;
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  return {
    confirmed: raw.confirmed,
    organizationId: text(raw.organizationId),
    confirmedAt: text(raw.confirmedAt),
    candidateName: text(raw.candidateName),
    hasNumber: raw.hasNumber === true,
    lastThree: text(raw.lastThree),
  };
}

function toSummary(raw: unknown): ImportSummary | null {
  if (!isRecord(raw) || typeof raw.importId !== 'string') return null;
  const { inserted, duplicates, changes } = raw;
  return typeof inserted === 'number' && typeof duplicates === 'number' && typeof changes === 'number' ? { importId: raw.importId, inserted, duplicates, changes } : null;
}

function toResults(raw: unknown): FoundResult[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.results)) return null;
  const results = raw.results.map(toResult);
  return results.some((result) => result === null) ? null : (results as FoundResult[]);
}

/** Client of the `results-import` Edge Function (contract of #81). Any failure that is not a typed error is "unavailable". */
export function createHttpOfficialResultsService({ url, accessToken, fetch }: Dependencies): OfficialResultsService {
  async function call<T>(body: object, read: (value: unknown) => T | null): Promise<OfficialResultsOutcome<T>> {
    try {
      const token = await accessToken();
      if (!token) return UNAVAILABLE;
      const reply = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const payload = await reply.json();
      if (!isRecord(payload)) return UNAVAILABLE;
      if (payload.ok === true) {
        const value = read(payload.value);
        return value === null ? UNAVAILABLE : { ok: true, value };
      }
      const error = toError(payload.error);
      return error ? { ok: false, error } : UNAVAILABLE;
    } catch {
      return UNAVAILABLE;
    }
  }

  return {
    status: (athleteId) => call({ action: 'status', athleteId }, toStatus),
    results: (athleteId) => call({ action: 'results', athleteId }, toResults),
    importChosen: (athleteId, resultIds) => call({ action: 'import', athleteId, resultIds }, toSummary),
  };
}

// Expo inlines EXPO_PUBLIC_* only on direct `process.env.NAME` access.
export const createSupabaseOfficialResultsService = (): OfficialResultsService =>
  createHttpOfficialResultsService({
    url: `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/results-import`,
    accessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    fetch: (url, init) => fetch(url, init),
  });
