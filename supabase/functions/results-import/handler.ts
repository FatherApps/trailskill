import type { ActionError, createOfficialResultsActions } from './actions.ts';
import { normalizeNumber } from './identityNumber.ts';
import type { createResultsImport, ImportError } from './service.ts';

type Service = ReturnType<typeof createResultsImport>;
type Official = ReturnType<typeof createOfficialResultsActions>;

export type HandlerDeps = {
  /** The id of the user whose JWT the request carries, or null. The user is never taken from the body. */
  authenticate: (request: Request) => Promise<string | null>;
  service: Pick<Service, 'findCandidates' | 'confirmCandidate' | 'findInTournament' | 'refreshTournaments'>;
  official: Pick<Official, 'status' | 'results' | 'import'>;
};

type HandlerError = ActionError | { code: 'unauthenticated' } | { code: 'internal' };

const STATUS: Record<HandlerError['code'], number> = {
  bad_request: 400,
  unauthenticated: 401,
  not_authorized: 403,
  no_provider: 404,
  identity_number_conflict: 409,
  identity_number_required: 409,
  not_confirmed: 409,
  unknown_id: 410,
  rate_limited: 429,
  internal: 500,
  unavailable: 502,
};

const NAME_MAX_LENGTH = 100;
const URL_MAX_LENGTH = 500;
const TOURNAMENT_KEY = /^\d{8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const respond = (status: number, body: unknown) => Response.json(body, { status });
const refuse = (error: HandlerError) => respond(STATUS[error.code], { ok: false, error });
const text = (value: unknown, maxLength: number) => (typeof value === 'string' && value.trim() !== '' && value.trim().length <= maxLength ? value.trim() : null);
const id = (value: unknown) => (typeof value === 'string' && UUID.test(value) ? value : null);

// Absent or null is "no organization"; anything else must be a uuid, or the whole request is refused (undefined).
const optionalId = (value: unknown) => (value === undefined || value === null ? null : (id(value) ?? undefined));
// The number a person typed: absent or null is "none"; otherwise it must be one the sources accept, and goes on normalized (undefined when it is not).
const typedNumber = (value: unknown) => {
  if (value === undefined || value === null) return null;
  try {
    return typeof value === 'string' ? normalizeNumber(value) : undefined;
  } catch {
    return undefined;
  }
};

// Exactly one of `url` (the address as pasted) and `tournamentKey` (a `YYYYMMDD` day of the platform's list); absent or null is "not given".
// Both, neither or one that is not valid is undefined, and the whole request is refused.
const tournamentTarget = (body: Record<string, unknown>) => {
  const [url, key] = [body.url ?? null, body.tournamentKey ?? null];
  if ((url === null) === (key === null)) return undefined;
  if (key === null) {
    const address = text(url, URL_MAX_LENGTH);
    return address ? { url: address } : undefined;
  }
  return typeof key === 'string' && TOURNAMENT_KEY.test(key) ? { tournamentKey: key } : undefined;
};

type Body = Record<string, unknown>;
type Action = (userId: string, body: Body) => Promise<Response> | Response;

/**
 * One POST endpoint, `{ action, ... }`. Each action validates its own fields and answers `{ ok, value | error }`.
 * `status`, `results` and `import` are the official results update: they read what was confirmed (of one organization when
 * `organizationId` is sent, else of the federation), list what the source has behind opaque ids, and import the ids the guardian chose.
 * `tournament` looks one tournament up on a results platform, by the stored identity number or the one typed (`identityNumber`, optional), and
 * answers `{ organizationId, candidate }`; `confirm` then answers `{ results }` for it (or `{}` for a federation). The tournament is given by
 * exactly one of `tournamentKey` (a `YYYYMMDD` day of the platform's list, see `refresh_tournaments`) or `url` (the address as pasted, the fallback).
 * `refresh_tournaments` fills that list from each platform, at most once a day each, and answers `{ refreshed, skipped }`.
 */
export function createHandler({ authenticate, service, official }: HandlerDeps) {
  const answer = <T>(outcome: { ok: true; value: T } | { ok: false; error: ActionError }, value: (v: T) => unknown) =>
    outcome.ok ? respond(200, { ok: true, value: value(outcome.value) }) : refuse(outcome.error);

  const actions: Record<string, Action> = {
    async search(userId, body) {
      const [athleteId, organizationId] = [id(body.athleteId), id(body.organizationId)];
      const [firstName, lastName] = [text(body.firstName, NAME_MAX_LENGTH), text(body.lastName, NAME_MAX_LENGTH)];
      if (!athleteId || !organizationId || !firstName || !lastName) return refuse({ code: 'bad_request' });
      return answer(await service.findCandidates({ userId, athleteId, organizationId, firstName, lastName }), (candidates) => ({ candidates }));
    },
    async confirm(userId, body) {
      const [athleteId, organizationId] = [id(body.athleteId), id(body.organizationId)];
      const candidateId = id(body.candidateId);
      if (!athleteId || !organizationId || !candidateId) return refuse({ code: 'bad_request' });
      return answer(await service.confirmCandidate({ userId, athleteId, organizationId, candidateId }), (value) => value ?? {});
    },
    async tournament(userId, body) {
      const [athleteId, target, identityNumber] = [id(body.athleteId), tournamentTarget(body), typedNumber(body.identityNumber)];
      if (!athleteId || !target || identityNumber === undefined) return refuse({ code: 'bad_request' });
      return answer(await service.findInTournament({ userId, athleteId, identityNumber, ...target }), (value) => value);
    },
    // Any signed-in user may ask: it needs no athlete, and the service refreshes each platform at most once a day.
    async refresh_tournaments() {
      return answer(await service.refreshTournaments(), (value) => value);
    },
    async status(userId, body) {
      const [athleteId, organizationId] = [id(body.athleteId), optionalId(body.organizationId)];
      if (!athleteId || organizationId === undefined) return refuse({ code: 'bad_request' });
      return answer(await official.status({ userId, athleteId, organizationId }), (value) => value);
    },
    async results(userId, body) {
      const [athleteId, organizationId] = [id(body.athleteId), optionalId(body.organizationId)];
      if (!athleteId || organizationId === undefined) return refuse({ code: 'bad_request' });
      return answer(await official.results({ userId, athleteId, organizationId }), (value) => value);
    },
    async import(userId, body) {
      const athleteId = id(body.athleteId);
      if (!athleteId) return refuse({ code: 'bad_request' });
      // The ids are checked by the action: an array of non-empty strings, within the cap.
      return answer(await official.import({ userId, athleteId, resultIds: body.resultIds }), (value) => value);
    },
  };

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return respond(405, { ok: false, error: { code: 'bad_request' } });
    const userId = await authenticate(request);
    if (!userId) return refuse({ code: 'unauthenticated' });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return refuse({ code: 'bad_request' });
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return refuse({ code: 'bad_request' });
    const action = Object.hasOwn(actions, String((body as Body).action)) ? actions[String((body as Body).action)] : null;
    if (!action) return refuse({ code: 'bad_request' });
    try {
      return await action(userId, body as Body);
    } catch (error) {
      // Only the kind of error is logged: the message of a failure could echo what the request carried.
      console.error(`results-import failed: ${error instanceof Error ? error.name : 'unknown'}`);
      return refuse({ code: 'internal' });
    }
  };
}
