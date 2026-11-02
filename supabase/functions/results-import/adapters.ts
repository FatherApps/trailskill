import type { ImportRecorder } from './actions.ts';
import type { OrganizationData } from './registry.ts';
import { InvalidSourceKeyError, NotAuthorizedError, type Claim, type Confirmations, type IdentityNumbers, type PendingStore, type QueryGate } from './service.ts';

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
const NOT_IN_FORCE = '55000';
const INVALID_VALUE = '22023';

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

/** #799's service_role functions and this issue's `keep`. `read` must only follow a check that `import_official_results` is in force. */
export function createIdentityNumbers(db: Db): IdentityNumbers {
  return {
    async read(athleteId) {
      const { data, error } = await db.rpc('athlete_identity_number', { athlete_id: athleteId });
      if (error || (data !== null && typeof data !== 'string')) throw failure('Reading the identity number', error);
      return data;
    },
    async keep(athleteId, identityNumber) {
      const { data, error } = await db.rpc('results_import_keep_identity_number', { athlete: athleteId, identity_number: identityNumber });
      if (error?.code === INVALID_VALUE) throw new InvalidSourceKeyError();
      if (error?.code === NOT_IN_FORCE) throw new NotAuthorizedError();
      if (error || typeof data !== 'boolean') throw failure('Keeping the identity number', error);
      return data;
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
    async put({ kind, userId, athleteId, organizationId, provider, reference, payload, ttlMs, id, restoreUntil }) {
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
        restore_until: restoreUntil === undefined ? null : new Date(restoreUntil).toISOString(),
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

/** `public.results_import_access`: the user manages the athlete and `import_official_results` is in force. It spends no rate limit. */
export function createAccess(db: Db) {
  return {
    async allowed({ userId, athleteId }: { userId: string; athleteId: string }): Promise<boolean> {
      const { data, error } = await db.rpc('results_import_access', { athlete: athleteId, requested_by: userId });
      if (error || typeof data !== 'boolean') throw failure('Checking the import access', error);
      return data;
    },
  };
}

/** `public.results_import_latest_confirmation`: the newest "is this the person?" confirmation of the athlete, or null. */
export function createConfirmationReader(db: Db) {
  return {
    async latest(athleteId: string): Promise<{ organizationId: string; confirmedAt: string; candidateName: string } | null> {
      const { data, error } = await db.rpc('results_import_latest_confirmation', { athlete: athleteId });
      if (error || !Array.isArray(data)) throw failure('Reading the confirmation', error);
      if (data.length === 0) return null;
      const { organization_id: organizationId, confirmed_at: confirmedAt, candidate_name: candidateName } = data[0] as Record<string, unknown>;
      if (typeof organizationId !== 'string' || typeof confirmedAt !== 'string' || typeof candidateName !== 'string') throw failure('Reading the confirmation', null);
      return { organizationId, confirmedAt: new Date(confirmedAt).toISOString(), candidateName };
    },
  };
}

/** `public.record_imported_results`: one import with its provenance; the differences become pending changes inside the database. */
export function createImportRecorder(db: Db): ImportRecorder {
  return {
    async record({ athleteId, organizationId, requestedBy, results }) {
      const { data, error } = await db.rpc('record_imported_results', {
        athlete: athleteId,
        organization: organizationId,
        requested_by: requestedBy,
        results,
      });
      if (error?.code === NOT_AUTHORIZED) throw new NotAuthorizedError();
      const summary = data as Record<string, unknown> | null;
      if (
        error || typeof summary !== 'object' || summary === null || typeof summary.importId !== 'string' ||
        typeof summary.inserted !== 'number' || typeof summary.duplicates !== 'number' || typeof summary.changes !== 'number'
      ) {
        throw failure('Recording the imported results', error);
      }
      return { importId: summary.importId, inserted: summary.inserted, duplicates: summary.duplicates, changes: summary.changes };
    },
  };
}
