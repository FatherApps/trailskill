import { supabase } from '../../../core/sync';

// What a school sends to register a swimmer who has no account. The id is made on the device, so sending the same call again (a retry)
// never creates a second swimmer. `guardianAuthorizationCollected` is the school's attestation that it holds the guardian's signed
// authorization from enrollment: the type only allows `true` and the server refuses anything else.
export type RegisterAthleteInput = {
  athleteId: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  guardianAuthorizationCollected: true;
};
// The claim link the server generated: the token goes to the family, the expiry is ISO 8601.
export type AthleteClaimLink = { athleteId: string; token: string; expiresAt: string };

// What the family accepted by claiming the swimmer: the three authorizations of joining a school, with the text shown and the id made on
// the device, the same as accepting a school invitation. `relation` is `guardian`, or `self` for an adult swimmer claiming their own profile.
export type ClaimAthleteInput = {
  token: string;
  relation: 'guardian' | 'self';
  acceptedAt: string;
  authorizations: { id: string; purpose: string; textId: string }[];
};

export interface AthleteRegistrationRepository {
  /**
   * An active admin of the school registers a swimmer who has no account: the swimmer, its link with the school and a claim link are made
   * in one step, and the school stays responsible for the profile until a family claims it. Online only, because the server makes the
   * token. Rejects with `not_allowed` (not an active admin of that school), `invalid` (a name, the id or the attestation is wrong) or the
   * original error for anything else, offline included. Repeating the same call answers with the same link.
   */
  register(input: RegisterAthleteInput): Promise<AthleteClaimLink>;
  /**
   * A guardian, or the adult swimmer, opens a claim link: the caller becomes a manager of the swimmer and records the three authorizations,
   * in one step. Answers with the swimmer id. Online, signed in. Rejects with `link_not_found` (unknown, expired, already used, or the school
   * ended the swimmer), `invalid` (relation or authorizations are wrong) or the original error for anything else. A used link fails for
   * everyone, so after a lost answer read whether the caller now manages the swimmer instead of repeating the call.
   */
  claim(input: ClaimAthleteInput): Promise<string>;
}

// The part of the Supabase client used here; tests pass a fake.
type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: (Error & { code?: string }) | null }> };

// 42501: the database refused the caller; 22023: invalid values; P0002: no such open link (see register_athlete_in_school and claim_athlete).
const ERROR_BY_CODE: Record<string, string> = { '42501': 'not_allowed', '22023': 'invalid', P0002: 'link_not_found' };

function failure(error: Error & { code?: string }): Error {
  const known = error.code ? ERROR_BY_CODE[error.code] : undefined;
  return known ? new Error(known) : error;
}

export function createSupabaseAthleteRegistrationRepository(client: RpcClient = supabase): AthleteRegistrationRepository {
  return {
    async register({ athleteId, schoolId, firstName, lastName, guardianAuthorizationCollected }) {
      const { data, error } = await client.rpc('register_athlete_in_school', {
        athlete_id: athleteId,
        school_id: schoolId,
        first_name: firstName,
        last_name: lastName,
        guardian_authorization_collected: guardianAuthorizationCollected,
      });
      if (error) throw failure(error);
      const link = data as { athlete_id: string; token: string; expires_at: string };
      return { athleteId: link.athlete_id, token: link.token, expiresAt: link.expires_at };
    },
    async claim({ token, relation, acceptedAt, authorizations }) {
      const { data, error } = await client.rpc('claim_athlete', {
        token,
        relation,
        accepted_at: acceptedAt,
        authorizations: authorizations.map(({ id, purpose, textId }) => ({ id, purpose, text_id: textId })),
      });
      if (error) throw failure(error);
      return data as string;
    },
  };
}

// The same 14 days as the server. PROVISIONAL (issue 1422): the maintainer confirms the lifetime, as for school invitations.
const LINK_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

export function createInMemoryAthleteRegistrationRepository(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  const registered: RegisterAthleteInput[] = [];
  const claimed: ClaimAthleteInput[] = [];
  const links = new Map<string, AthleteClaimLink & { used: boolean }>();
  const repository = {
    registered,
    claimed,
    // An error that rejects every call, for example 'not_allowed' for a coach or 'link_not_found'.
    rejectWith: undefined as string | undefined,
    async register(input: RegisterAthleteInput): Promise<AthleteClaimLink> {
      if (repository.rejectWith) throw new Error(repository.rejectWith);
      const existing = [...links.values()].find((link) => link.athleteId === input.athleteId);
      if (existing) return { athleteId: existing.athleteId, token: existing.token, expiresAt: existing.expiresAt };
      registered.push({ ...input });
      const link = {
        athleteId: input.athleteId,
        token: String(links.size + 1).padStart(32, '0'),
        expiresAt: new Date(now().getTime() + LINK_LIFETIME_MS).toISOString(),
        used: false,
      };
      links.set(link.token, link);
      return { athleteId: link.athleteId, token: link.token, expiresAt: link.expiresAt };
    },
    async claim(input: ClaimAthleteInput): Promise<string> {
      if (repository.rejectWith) throw new Error(repository.rejectWith);
      const link = links.get(input.token);
      if (!link || link.used || new Date(link.expiresAt) <= now()) throw new Error('link_not_found');
      link.used = true;
      claimed.push({ ...input });
      return link.athleteId;
    },
  };
  return repository;
}
