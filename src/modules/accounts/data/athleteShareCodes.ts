import { supabase } from '../../../core/sync';

/** Too many failed lookups in a short while: the server refuses lookups for a few minutes. */
export class TooManyShareCodeLookupsError extends Error {
  override name = 'TooManyShareCodeLookupsError';
}

/** The server refuses the code: the caller no longer manages the swimmer (insufficient_privilege). A missing signal is not this. */
export class ShareCodeRefusedError extends Error {
  override name = 'ShareCodeRefusedError';
}

/**
 * The short code of a swimmer (for example TS-7K4Q2M) that their guardian gives to another family, so that family can share
 * times with the swimmer. Online only: the server keeps the codes and decides who may see or change them.
 */
export interface AthleteShareCodeRepository {
  /** The swimmer's code, created the first time. Only who manages the swimmer gets it. */
  get(athleteId: string): Promise<string>;
  /** Replaces the swimmer's code; the old one stops working at once. Returns the new one. */
  change(athleteId: string): Promise<string>;
  /** The short name ("Ana M.") of the swimmer with that code, or null. Throws TooManyShareCodeLookupsError after too many failures. */
  find(code: string): Promise<string | null>;
}

export function createSupabaseAthleteShareCodeRepository(): AthleteShareCodeRepository {
  return {
    async get(athleteId) {
      const { data, error } = await supabase.rpc('athlete_share_code', { athlete: athleteId });
      if (error) throw error.code === '42501' ? new ShareCodeRefusedError() : error;
      return data as string;
    },
    async change(athleteId) {
      const { data, error } = await supabase.rpc('rotate_athlete_share_code', { athlete: athleteId });
      if (error) throw error;
      return data as string;
    },
    async find(code) {
      const { data, error } = await supabase.rpc('find_athlete_by_share_code', { share_code: code });
      if (error) throw error.message === 'too_many_attempts' ? new TooManyShareCodeLookupsError() : error;
      return (data as string | null) ?? null;
    },
  };
}

// For tests and the gallery: codes are TS-AAAAA1, TS-AAAAA2… in the order they are made.
export function createInMemoryAthleteShareCodeRepository(options: { names?: Record<string, string>; failing?: boolean; refusing?: boolean } = {}) {
  const codes = new Map<string, string>();
  let made = 0;
  const next = () => `TS-AAAAA${++made}`;
  const repository: AthleteShareCodeRepository & { codes: Map<string, string> } = {
    codes,
    async get(athleteId) {
      if (options.refusing) throw new ShareCodeRefusedError();
      if (options.failing) throw new Error('no signal');
      const code = codes.get(athleteId) ?? next();
      codes.set(athleteId, code);
      return code;
    },
    async change(athleteId) {
      if (options.failing) throw new Error('no signal');
      const code = next();
      codes.set(athleteId, code);
      return code;
    },
    async find(code) {
      const athleteId = [...codes].find(([, value]) => value === code)?.[0];
      return athleteId ? (options.names?.[athleteId] ?? null) : null;
    },
  };
  return repository;
}
