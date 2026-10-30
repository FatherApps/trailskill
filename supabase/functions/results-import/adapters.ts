import type { OrganizationData } from './registry.ts';
import { NotAuthorizedError, type Claim, type Confirmations, type IdentityNumbers, type PendingStore, type QueryGate } from './service.ts';

// The message is typed so it can be seen and dropped: errors built here never repeat it.
export type DbError = { code?: string; message?: string };

/**
 * The service_role client, reduced to what these adapters use. Every value travels as a bound parameter of the call
 * (PostgREST arguments), never inside SQL text, so none reaches a statement or the Postgres log.
 */
export interface Db {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: DbError | null }>;
  select(table: string, columns: string): Promise<{ data: Record<string, unknown>[] | null; error: DbError | null }>;
  deleteById(table: string, id: string): Promise<{ error: DbError | null }>;
}

const NOT_AUTHORIZED = '42501';

// An error carries the Postgres code and nothing else: the message of a failed call could echo an argument.
const failure = (what: string, error: DbError | null) => new Error(`${what} failed${error ? ` (${error.code ?? 'unknown'})` : ''}`);

/** `public.results_import_claim_query` answers null (claim taken), the instant of the next allowed query, or raises 42501. */
export function createQueryGate(db: Db): QueryGate {
  return {
    async claim({ athleteId, userId, intervalMs }): Promise<Claim> {
      const { data, error } = await db.rpc('results_import_claim_query', {
        athlete: athleteId,
        requested_by: userId,
        min_interval: `${intervalMs / 1000} seconds`,
      });
      if (error?.code === NOT_AUTHORIZED) return { status: 'not_authorized' };
      if (error) throw failure('Claiming the source query', error);
      if (data === null) return { status: 'allowed' };
      const retryAt = typeof data === 'string' ? new Date(data) : null;
      if (!retryAt || Number.isNaN(retryAt.getTime())) throw failure('Claiming the source query', null);
      return { status: 'rate_limited', retryAt: retryAt.toISOString() };
    },
  };
}

/** #799's service_role functions. `read` must only follow a check that `import_official_results` is in force. */
export function createIdentityNumbers(db: Db): IdentityNumbers {
  return {
    async read(athleteId) {
      const { data, error } = await db.rpc('athlete_identity_number', { athlete_id: athleteId });
      if (error || (data !== null && typeof data !== 'string')) throw failure('Reading the identity number', error);
      return data;
    },
    async save(athleteId, identityNumber) {
      const { error } = await db.rpc('save_athlete_identity_number_as_service', { athlete_id: athleteId, identity_number: identityNumber });
      if (error) throw failure('Saving the identity number', error);
    },
  };
}

export function createConfirmations(db: Db): Confirmations {
  return {
    async record({ athleteId, organizationId, userId, evidence }) {
      const { data, error } = await db.rpc('record_results_import_confirmation', {
        athlete: athleteId,
        organization: organizationId,
        confirmed_by: userId,
        evidence,
      });
      if (error?.code === NOT_AUTHORIZED) throw new NotAuthorizedError();
      if (error || typeof data !== 'string') throw failure('Recording the confirmation', error);
      return data;
    },
    async remove(id) {
      const { error } = await db.deleteById('results_import_confirmations', id);
      if (error) throw failure('Removing the confirmation', error);
    },
  };
}

/** Organizations with the provider key their results source assigns to them; the registry walks up the parents itself. */
export function createOrganizationChain(db: Db) {
  return async (_organizationId: string): Promise<OrganizationData[]> => {
    const [organizations, sources] = await Promise.all([
      db.select('organizations', 'id,type,country_code,parent_organization_id'),
      db.select('results_import_sources', 'organization_id,provider'),
    ]);
    if (organizations.error || !organizations.data) throw failure('Reading the organizations', organizations.error);
    if (sources.error || !sources.data) throw failure('Reading the results sources', sources.error);
    const providers = new Map(sources.data.map((source) => [source.organization_id as string, source.provider as string]));
    return organizations.data.map((row) => ({
      id: row.id as string,
      type: row.type as OrganizationData['type'],
      countryCode: (row.country_code as string | null) ?? null,
      parentId: (row.parent_organization_id as string | null) ?? null,
      provider: providers.get(row.id as string) ?? null,
    }));
  };
}

/** `public.results_import_pending_put` / `_take`: the source's key is encrypted inside the database; here it is only a bound parameter. */
export function createPendingStore(db: Db): PendingStore {
  return {
    async put({ kind, userId, athleteId, organizationId, provider, reference, payload, ttlMs, id }) {
      const { data, error } = await db.rpc('results_import_pending_put', {
        kind,
        requested_by: userId,
        athlete: athleteId,
        organization: organizationId,
        provider,
        reference,
        payload,
        ttl: `${ttlMs / 1000} seconds`,
        pending_id: id ?? null,
      });
      if (error?.code === NOT_AUTHORIZED) throw new NotAuthorizedError();
      if (error || typeof data !== 'string') throw failure('Storing the pending entry', error);
      return data;
    },
    async take({ id, kind, userId, athleteId }) {
      const { data, error } = await db.rpc('results_import_pending_take', { pending: id, kind, requested_by: userId, athlete: athleteId });
      if (error) throw failure('Taking the pending entry', error);
      if (!Array.isArray(data) || data.length === 0) return null;
      const row = data[0] as Record<string, unknown>;
      const expiresAt = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : Number.NaN;
      const { organization_id: organizationId, provider, reference, payload } = row;
      if (
        typeof organizationId !== 'string' || typeof provider !== 'string' || typeof reference !== 'string' ||
        typeof payload !== 'object' || payload === null || Number.isNaN(expiresAt)
      ) {
        throw failure('Taking the pending entry', null);
      }
      return { kind, userId, athleteId, organizationId, provider, reference, payload: payload as Record<string, unknown>, expiresAt };
    },
  };
}
