import type { createInviteCoach, InviteError } from './service.ts';

export type HandlerDeps = {
  /** The id of the user whose JWT the request carries, or null. The user is never taken from the body. */
  authenticate: (request: Request) => Promise<string | null>;
  service: { inviteCoach: ReturnType<typeof createInviteCoach> };
};

type HandlerError = InviteError | { code: 'bad_request' } | { code: 'unauthenticated' } | { code: 'internal' };

const STATUS: Record<HandlerError['code'], number> = {
  bad_request: 400,
  unauthenticated: 401,
  not_authorized: 403,
  internal: 500,
  unavailable: 502,
};

const EMAIL_MAX_LENGTH = 254;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The same shape the coach_invitations check accepts.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const respond = (status: number, body: unknown) => Response.json(body, { status });
const refuse = (error: HandlerError) => respond(STATUS[error.code], { ok: false, error });

/** The email as stored: trimmed and lowercase; null when it is not an email. */
const email = (value: unknown) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized.length <= EMAIL_MAX_LENGTH && EMAIL.test(normalized) ? normalized : null;
};

/**
 * One POST endpoint, `{ schoolId, email }`, answering `{ ok, value | error }`: `{ invitationId }` once the pending invitation of
 * the school exists and was delivered. Who may invite is decided by the database, as the caller.
 */
export function createHandler({ authenticate, service }: HandlerDeps) {
  return async function handle(request: Request): Promise<Response> {
    // No CORS/OPTIONS on purpose: only the native app calls this function (supabase-js functions.invoke), never a browser origin.
    if (request.method !== 'POST') return respond(405, { ok: false, error: { code: 'bad_request' } });
    if (!(await authenticate(request))) return refuse({ code: 'unauthenticated' });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return refuse({ code: 'bad_request' });
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return refuse({ code: 'bad_request' });
    const { schoolId, email: typed } = body as Record<string, unknown>;
    const normalized = email(typed);
    if (typeof schoolId !== 'string' || !UUID.test(schoolId) || !normalized) return refuse({ code: 'bad_request' });
    try {
      const outcome = await service.inviteCoach({ schoolId, email: normalized });
      return outcome.ok ? respond(200, outcome) : refuse(outcome.error);
    } catch (error) {
      // Only the kind of error is logged: the message of a failure could echo what the request carried.
      console.error(`school-console-invite-coach failed: ${error instanceof Error ? error.name : 'unknown'}`);
      return refuse({ code: 'internal' });
    }
  };
}
