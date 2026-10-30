import type { NormalizedResult } from './port.ts';
import type { IdentityNumbers, ImportError, Outcome, createResultsImport } from './service.ts';

// The ids of offered results live this long on the server, as `public.results_import_pending_put` limits them.
export const PENDING_TTL_MS = 15 * 60 * 1000;
// shortcut: a source with more than 500 results cannot be imported in one call (bad_request), upgrade to chunked imports if a real athlete reaches it.
export const MAX_IDS = 500;

export type ActionError = ImportError | { code: 'unknown_id' } | { code: 'not_confirmed' } | { code: 'bad_request' };
export type ActionOutcome<T> = { ok: true; value: T } | { ok: false; error: ActionError };

/** What waits on the server for an offered result: its values, never the source key (that is the `reference`). */
export type ResultPayload = Omit<NormalizedResult, 'sourceResultKey'>;

/** `expiresAt` (ISO) is when the row was due to expire; a restore keeps what was left of it, never more. */
export type PendingRow = { organizationId: string; provider: string; reference: string; payload: ResultPayload; expiresAt: string };

/**
 * Implemented by `public.results_import_pending_put` / `results_import_pending_take` (service_role only, owned by #81):
 * single use, 15 minutes, bound to user, athlete and kind (this port is always kind 'results'; the adapter passes it). `take` returns null for an expired, used or foreign id.
 */
export interface PendingResults {
  put(input: {
    requestedBy: string;
    athleteId: string;
    organizationId: string;
    provider: string;
    reference: string;
    payload: ResultPayload;
    // 0 to 15 minutes; anything else is rejected by the database (22023).
    ttlMs: number;
    // Put a taken row back under its own id, with the time it had left.
    pendingId?: string;
  }): Promise<string>;
  take(input: { id: string; requestedBy: string; athleteId: string }): Promise<PendingRow | null>;
}

export type ImportSummary = { importId: string; inserted: number; duplicates: number; changes: number };

/** Implemented by `public.record_imported_results(athlete, organization, requested_by, results)`. */
export interface ImportRecorder {
  record(input: { athleteId: string; organizationId: string; requestedBy: string; results: NormalizedResult[] }): Promise<ImportSummary>;
}

type Dependencies = {
  service: ReturnType<typeof createResultsImport>;
  identityNumbers: IdentityNumbers;
  pending: PendingResults;
  recorder: ImportRecorder;
  /** The user manages the athlete and `import_official_results` is in force. Spends no rate limit. */
  access: { allowed(input: { userId: string; athleteId: string }): Promise<boolean> };
  /** The latest "¿Es esta persona?" confirmation of the athlete, from `results_import_confirmations`. */
  confirmations: { latest(athleteId: string): Promise<{ organizationId: string; confirmedAt: string; candidateName: string } | null> };
  /** The provider key registered for the organization (`results_import_sources`), or null. */
  providerKeyFor(organizationId: string): Promise<string | null>;
  now?: () => number;
};

type Who = { userId: string; athleteId: string };

const fail = (error: ActionError): { ok: false; error: ActionError } => ({ ok: false, error });
const UNAVAILABLE = fail({ code: 'unavailable' });

export function createOfficialResultsActions({ service, identityNumbers, pending, recorder, access, confirmations, providerKeyFor, now = Date.now }: Dependencies) {
  // Authorization first, so a caller who may not import learns nothing; then the confirmation, before any rate limit is spent.
  async function begin({ userId, athleteId }: Who): Promise<{ organizationId: string } | { error: ActionError }> {
    if (!(await access.allowed({ userId, athleteId }))) return { error: { code: 'not_authorized' } };
    const confirmation = await confirmations.latest(athleteId);
    return confirmation ? { organizationId: confirmation.organizationId } : { error: { code: 'not_confirmed' } };
  }

  async function ask(who: Who): Promise<ActionOutcome<{ organizationId: string; results: NormalizedResult[] }>> {
    const started = await begin(who);
    if ('error' in started) return fail(started.error);
    const outcome: Outcome<NormalizedResult[]> = await service.refreshResults({ ...who, organizationId: started.organizationId });
    return outcome.ok ? { ok: true, value: { organizationId: started.organizationId, results: outcome.value } } : fail(outcome.error);
  }

  // A taken row goes back under its own id with the time it had left, never more; one already expired stays gone.
  // Best effort: if this fails too, the ids expire and the guardian asks again.
  async function restore(taken: Map<string, PendingRow>, who: Who) {
    await Promise.allSettled(
      [...taken].flatMap(([id, { expiresAt, ...row }]) => {
        const ttlMs = Math.min(PENDING_TTL_MS, Date.parse(expiresAt) - now());
        return ttlMs > 0 ? [pending.put({ ...row, requestedBy: who.userId, athleteId: who.athleteId, ttlMs, pendingId: id })] : [];
      }),
    );
  }

  return {
    // Neither asks the source nor spends the rate limit.
    async status(who: Who): Promise<ActionOutcome<{ confirmed: boolean; organizationId: string | null; confirmedAt: string | null; candidateName: string | null; hasNumber: boolean; lastThree: string | null }>> {
      if (!(await access.allowed(who))) return fail({ code: 'not_authorized' });
      const confirmation = await confirmations.latest(who.athleteId);
      if (!confirmation) return { ok: true, value: { confirmed: false, organizationId: null, confirmedAt: null, candidateName: null, hasNumber: false, lastThree: null } };
      const number = await identityNumbers.read(who.athleteId);
      return {
        ok: true,
        value: { confirmed: true, ...confirmation, hasNumber: number !== null, lastThree: number === null ? null : number.slice(-3) },
      };
    },

    // Lists what the source has for this athlete and imports nothing: each result waits behind an opaque id.
    async results(who: Who): Promise<ActionOutcome<{ results: (ResultPayload & { id: string })[] }>> {
      const asked = await ask(who);
      if (!asked.ok) return asked;
      const { organizationId, results } = asked.value;
      try {
        const provider = await providerKeyFor(organizationId);
        if (provider === null) return fail({ code: 'no_provider' });
        const offered = await Promise.all(
          results.map(async ({ sourceResultKey, ...payload }) => {
            const id = await pending.put({ requestedBy: who.userId, athleteId: who.athleteId, organizationId, provider, reference: sourceResultKey, payload, ttlMs: PENDING_TTL_MS });
            return { id, ...payload };
          }),
        );
        return { ok: true, value: { results: offered } };
      } catch {
        return UNAVAILABLE;
      }
    },

    // Imports exactly the offered results the guardian chose. All or none: a part that is no longer valid rejects the whole call.
    async import(input: Who & { resultIds: unknown }): Promise<ActionOutcome<ImportSummary>> {
      const { resultIds, ...who } = input;
      if (!(await access.allowed(who))) return fail({ code: 'not_authorized' });
      if (!Array.isArray(resultIds) || resultIds.length === 0 || resultIds.length > MAX_IDS || !resultIds.every((id) => typeof id === 'string' && id !== '')) {
        return fail({ code: 'bad_request' });
      }
      const taken = new Map<string, PendingRow>();
      try {
        for (const id of new Set(resultIds as string[])) {
          const row = await pending.take({ id, requestedBy: who.userId, athleteId: who.athleteId });
          if (row === null) {
            await restore(taken, who);
            return fail({ code: 'unknown_id' });
          }
          taken.set(id, row);
        }
        const rows = [...taken.values()];
        const [first] = rows;
        if (rows.some((row) => row.organizationId !== first!.organizationId || row.provider !== first!.provider)) {
          await restore(taken, who);
          return fail({ code: 'bad_request' });
        }
        const summary = await recorder.record({
          athleteId: who.athleteId,
          organizationId: first!.organizationId,
          requestedBy: who.userId,
          results: rows.map(({ reference, payload }) => ({ sourceResultKey: reference, ...payload })),
        });
        return { ok: true, value: summary };
      } catch {
        await restore(taken, who);
        return UNAVAILABLE;
      }
    },
  };
}
