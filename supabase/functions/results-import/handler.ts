import type { ActionError, createOfficialResultsActions } from './actions.ts';
import { isPool } from '../../../src/core/sport/catalogs.ts';
import { normalizeNumber } from './identityNumber.ts';
import type { createResultsImport, ImportError } from './service.ts';

type Service = ReturnType<typeof createResultsImport>;
type Official = ReturnType<typeof createOfficialResultsActions>;

export type HandlerDeps = {
  /** The id of the user whose JWT the request carries, or null. The user is never taken from the body. */
  authenticate: (request: Request) => Promise<string | null>;
  service: Pick<Service, 'findCandidates' | 'confirmCandidate' | 'findInTournament' | 'refreshTournaments' | 'backfillTournaments'>;
  official: Pick<Official, 'status' | 'results' | 'import'>;
  /** Whether a bearer token is the operator's (the function's own service role key), compared in constant time. Only `backfill_tournaments` asks for it. */
  isOperatorToken: (token: string) => Promise<boolean>;
  /** The clock for the months `backfill_tournaments` accepts. */
  now?: () => number;
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
// The first year the platform's catalog is filled back to.
const BACKFILL_FIRST_YEAR = 2023;
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

// Looks at the body of a copy of the request: whether it asks for the operator's action. A body that is not JSON is the users' path's to refuse.
const isBackfill = (request: Request) =>
  request.clone().json().then(
    (body) => typeof body === 'object' && body !== null && !Array.isArray(body) && (body as Body).action === 'backfill_tournaments',
    () => false,
  );
type Action = (userId: string, body: Body) => Promise<Response> | Response;

/**
 * One POST endpoint, `{ action, ... }`. Each action validates its own fields and answers `{ ok, value | error }`.
 * `status`, `results` and `import` are the official results update: they read what was confirmed (of one organization when
 * `organizationId` is sent, else of the federation), list what the source has behind opaque ids, and import the ids the guardian chose.
 * `tournament` looks one tournament up on a results platform, by the stored identity number or the one typed (`identityNumber`, optional), and
 * answers `{ organizationId, candidate }`; `confirm` then answers `{ results }` for it (or `{}` for a federation). The tournament is given by
 * exactly one of `tournamentKey` (a `YYYYMMDD` day of the platform's list, see `refresh_tournaments`) or `url` (the address as pasted, the fallback).
 * A tournament with only a results PDF is read by the athlete's name and birth date, which the server reads itself (never from the request); its candidate carries
 * `courseRequired: true` when no source says the pool length, and `confirm` then takes `course` (`SCM` or `LCM`, optional, the guardian's pick) and answers
 * the rows with it. A `course` that is not a pool is a bad request; an unavailable tournament may carry `reason` (`no_file`, `birth_date_required`).
 * `refresh_tournaments` fills that list from each platform, at most once a day each, and answers `{ refreshed, skipped }`.
 * `backfill_tournaments` is the operator's: it does not ask who the user is but whether the bearer token is the function's own service role key
 * (401 without a bearer, 403 for any other token), and answers `{ probed, found, saved, next, stoppedBy? }` for `{ year, month }`.
 */
export function createHandler({ authenticate, service, official, isOperatorToken, now = Date.now }: HandlerDeps) {
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
      // The pool length the guardian picked for a tournament read from a PDF: absent or null is "none"; anything else must be a pool of the catalog.
      const course = body.course ?? undefined;
      if (!athleteId || !organizationId || !candidateId || (course !== undefined && !isPool(course))) return refuse({ code: 'bad_request' });
      return answer(await service.confirmCandidate({ userId, athleteId, organizationId, candidateId, ...(course === undefined ? {} : { course }) }), (value) => value ?? {});
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

  // The operator's action, apart from the user's: its caller is not a user, so the user check is never asked and the others never see this action.
  async function backfill(request: Request): Promise<Response> {
    const token = /^Bearer (\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
    if (!token) return refuse({ code: 'unauthenticated' });
    if (!(await isOperatorToken(token))) return refuse({ code: 'not_authorized' });
    const { year, month } = (await request.json()) as Body;
    const today = new Date(now());
    const started = Number.isInteger(year) && Number.isInteger(month) && (year as number) * 12 + (month as number) <= today.getUTCFullYear() * 12 + today.getUTCMonth() + 1;
    if (!started || (year as number) < BACKFILL_FIRST_YEAR || (month as number) < 1 || (month as number) > 12) return refuse({ code: 'bad_request' });
    try {
      return answer(await service.backfillTournaments({ year: year as number, month: month as number }), (value) => value);
    } catch (error) {
      console.error(`results-import failed: ${error instanceof Error ? error.name : 'unknown'}`);
      return refuse({ code: 'internal' });
    }
  }

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return respond(405, { ok: false, error: { code: 'bad_request' } });
    if (await isBackfill(request)) return backfill(request);
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
