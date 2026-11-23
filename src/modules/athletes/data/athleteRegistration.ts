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

// What the school reads of the claim link of one of its swimmers. `open` can still be used; the other three cannot: `expired` and
// `revoked` are renewed by the school, `claimed` is done (the family manages the swimmer).
export type AthleteClaimLinkState = { status: 'open' | 'expired' | 'revoked' | 'claimed'; token: string; expiresAt: string };

export interface AthleteRegistrationRepository {
  /**
   * An active admin of the school registers a swimmer who has no account: the swimmer, its link with the school and a claim link are made
   * in one step, and the school stays responsible for the profile until a family claims it. Online only, because the server makes the
   * token. Rejects with `not_allowed` (not an active admin of that school), `invalid` (a name, the id or the attestation is wrong, or a re-send carries other names) or the
   * original error for anything else, offline included. Repeating the same call answers with the same link.
   */
  register(input: RegisterAthleteInput): Promise<AthleteClaimLink>;
  /**
   * A guardian, or the adult swimmer, opens a claim link: the caller becomes a manager of the swimmer and records the three authorizations,
   * in one step. Answers with the swimmer id. Online, signed in. Rejects with `not_allowed` (the caller is an active admin or coach of the enrolling
   * school: the school cannot claim its own swimmer), `link_not_found` (unknown, expired, already used, or the school ended the swimmer),
   * `invalid` (relation or authorizations are wrong) or the original error for anything else. A used link fails for
   * everyone, so after a lost answer read whether the caller now manages the swimmer instead of repeating the call.
   */
  claim(input: ClaimAthleteInput): Promise<string>;
  /**
   * An active admin of the enrolling school gets a new link for a swimmer nobody has claimed yet: the old token stops working at once and
   * the new one lasts 14 days. Online only. Rejects with `not_allowed` (not an active admin of that school, or no such swimmer), `not_open`
   * (the link was already claimed or the school ended the swimmer) or the original error for anything else.
   */
  renew(athleteId: string): Promise<AthleteClaimLink>;
  /**
   * An active admin of the enrolling school makes the link unusable (claiming it fails with `link_not_found`); renewing issues a new one.
   * Revoking a revoked link changes nothing. Online only. Rejects like `renew`.
   */
  revoke(athleteId: string): Promise<void>;
  /**
   * The state of the swimmer's link as the school sees it, or null when the swimmer has none (it did not enter through a claim link).
   * Online: the table is not synced. A row the caller may not read is also null.
   */
  findLink(athleteId: string): Promise<AthleteClaimLinkState | null>;
}

// The part of the Supabase client used here; tests pass a fake.
type Answer = { data: unknown; error: (Error & { code?: string }) | null };
type ClaimRow = { token: string; expires_at: string; claimed_at: string | null; revoked_at: string | null };
type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<Answer> };
// The one read of the repository: the school reads its own claim links (the table has no client write grant, and its policy lets only the school's admins and the platform read).
type LinkReader = { from(table: string): { select(columns: string): { eq(column: string, value: string): { maybeSingle(): PromiseLike<Answer> } } } };

// 42501: the database refused the caller; 22023: invalid values; P0002: no such open link (see register_athlete_in_school and claim_athlete);
// 55000: the link is already claimed or its enrollment ended (renew_athlete_claim_link and revoke_athlete_claim_link).
const ERROR_BY_CODE: Record<string, string> = { '42501': 'not_allowed', '22023': 'invalid', P0002: 'link_not_found', '55000': 'not_open' };

function failure(error: Error & { code?: string }): Error {
  const known = error.code ? ERROR_BY_CODE[error.code] : undefined;
  return known ? new Error(known) : error;
}

export function createSupabaseAthleteRegistrationRepository(client: RpcClient = supabase, reader: LinkReader = supabase as unknown as LinkReader): AthleteRegistrationRepository {
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
    async renew(athleteId) {
      const { data, error } = await client.rpc('renew_athlete_claim_link', { athlete_id: athleteId });
      if (error) throw failure(error);
      const link = data as { athlete_id: string; token: string; expires_at: string };
      return { athleteId: link.athlete_id, token: link.token, expiresAt: link.expires_at };
    },
    async revoke(athleteId) {
      const { error } = await client.rpc('revoke_athlete_claim_link', { athlete_id: athleteId });
      if (error) throw failure(error);
    },
    async findLink(athleteId) {
      const { data, error } = await reader.from('athlete_claims').select('token, expires_at, claimed_at, revoked_at').eq('athlete_id', athleteId).maybeSingle();
      if (error) throw failure(error);
      const row = data as ClaimRow | null;
      if (!row) return null;
      const status = row.claimed_at ? 'claimed' : row.revoked_at ? 'revoked' : new Date(row.expires_at) <= new Date() ? 'expired' : 'open';
      return { status, token: row.token, expiresAt: row.expires_at };
    },
  };
}

// The same 14 days as the server. PROVISIONAL (issue 1422): the maintainer confirms the lifetime, as for school invitations.
const LINK_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

export function createInMemoryAthleteRegistrationRepository(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  const registered: RegisterAthleteInput[] = [];
  const claimed: ClaimAthleteInput[] = [];
  const links = new Map<string, AthleteClaimLink & { schoolId: string; firstName: string; lastName: string; declaredBy: string; used: boolean; revoked: boolean }>();
  // Tokens are never reused: a renewed link gets the next number.
  let issued = 0;
  const tokenNumber = () => String(++issued).padStart(32, '0');
  // The server's rule for renew and revoke: an active admin of the enrolling school, on an unclaimed link.
  const adminLink = (athleteId: string) => {
    const link = [...links.values()].find((own) => own.athleteId === athleteId);
    if (!link || !repository.adminSchoolIds.includes(link.schoolId)) throw new Error('not_allowed');
    if (link.used || repository.endedAthleteIds.includes(athleteId)) throw new Error('not_open');
    return link;
  };
  const repository = {
    registered,
    claimed,
    // An error that rejects every call, for example 'not_allowed' for a coach or 'link_not_found'.
    rejectWith: undefined as string | undefined,
    // The schools where the caller is an active admin or coach: a claim of a link of one of them fails with 'not_allowed', as the server does.
    staffSchoolIds: [] as string[],
    // The schools where the caller is an active admin: renew, revoke and findLink are refused for the rest, as the server does (registering a swimmer does not make the caller an admin).
    adminSchoolIds: [] as string[],
    // Swimmers the school ended (the baja): their links cannot be renewed or revoked, nor claimed.
    endedAthleteIds: [] as string[],
    // Who the caller is: a re-send of a swimmer another user registered fails with 'not_allowed'.
    userId: 'caller',
    async register(input: RegisterAthleteInput): Promise<AthleteClaimLink> {
      if (repository.rejectWith) throw new Error(repository.rejectWith);
      const existing = [...links.values()].find((link) => link.athleteId === input.athleteId);
      if (existing) {
        // As the server: a re-send is only the same admin's own registration for the same school, with the same names.
        if (existing.schoolId !== input.schoolId || existing.declaredBy !== repository.userId) throw new Error('not_allowed');
        if (existing.firstName !== input.firstName || existing.lastName !== input.lastName) throw new Error('invalid');
        return { athleteId: existing.athleteId, token: existing.token, expiresAt: existing.expiresAt };
      }
      registered.push({ ...input });
      const link = {
        athleteId: input.athleteId,
        token: tokenNumber(),
        expiresAt: new Date(now().getTime() + LINK_LIFETIME_MS).toISOString(),
        schoolId: input.schoolId,
        firstName: input.firstName,
        lastName: input.lastName,
        declaredBy: repository.userId,
        used: false,
        revoked: false,
      };
      links.set(link.token, link);
      return { athleteId: link.athleteId, token: link.token, expiresAt: link.expiresAt };
    },
    async claim(input: ClaimAthleteInput): Promise<string> {
      if (repository.rejectWith) throw new Error(repository.rejectWith);
      const link = links.get(input.token);
      if (!link || link.used || link.revoked || repository.endedAthleteIds.includes(link.athleteId) || new Date(link.expiresAt) <= now()) throw new Error('link_not_found');
      if (repository.staffSchoolIds.includes(link.schoolId)) throw new Error('not_allowed');
      link.used = true;
      claimed.push({ ...input });
      return link.athleteId;
    },
    async renew(athleteId: string): Promise<AthleteClaimLink> {
      if (repository.rejectWith) throw new Error(repository.rejectWith);
      const link = adminLink(athleteId);
      links.delete(link.token);
      link.token = tokenNumber();
      link.expiresAt = new Date(now().getTime() + LINK_LIFETIME_MS).toISOString();
      link.revoked = false;
      links.set(link.token, link);
      return { athleteId: link.athleteId, token: link.token, expiresAt: link.expiresAt };
    },
    async revoke(athleteId: string): Promise<void> {
      if (repository.rejectWith) throw new Error(repository.rejectWith);
      adminLink(athleteId).revoked = true;
    },
    async findLink(athleteId: string): Promise<AthleteClaimLinkState | null> {
      if (repository.rejectWith) throw new Error(repository.rejectWith);
      const link = [...links.values()].find((own) => own.athleteId === athleteId);
      if (!link || !repository.adminSchoolIds.includes(link.schoolId)) return null;
      const status = link.used ? 'claimed' : link.revoked ? 'revoked' : new Date(link.expiresAt) <= now() ? 'expired' : 'open';
      return { status, token: link.token, expiresAt: link.expiresAt };
    },
  };
  return repository;
}
