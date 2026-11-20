import type { createAccountDeletion, DeletionError } from './service.ts';

export type HandlerDeps = {
  /** The id of the user whose JWT the request carries, or null. The user is never taken from the body. */
  authenticate: (request: Request) => Promise<string | null>;
  service: ReturnType<typeof createAccountDeletion>;
};

type HandlerError = DeletionError | { code: 'bad_request' } | { code: 'unauthenticated' } | { code: 'internal' };

const STATUS: Record<HandlerError['code'], number> = {
  bad_request: 400,
  invalid_code: 400,
  unauthenticated: 401,
  blocked_by_school: 403,
  platform_admin: 403,
  code_expired: 410,
  rate_limited: 429,
  too_many_attempts: 429,
  internal: 500,
  unavailable: 502,
};

const CODE = /^\d{6}$/;

const respond = (status: number, body: unknown) => Response.json(body, { status });
const refuse = (error: HandlerError) => respond(STATUS[error.code], { ok: false, error });

/**
 * One POST endpoint, `{ step: 'request' | 'confirm' | 'cancel', code? }`, answering `{ ok, value | error }`. The account is always the
 * one of the token. The confirmation code is never in an answer: it only goes by email.
 */
export function createHandler({ authenticate, service }: HandlerDeps) {
  return async function handle(request: Request): Promise<Response> {
    // No CORS/OPTIONS on purpose: only the native app calls this function (supabase-js functions.invoke), never a browser origin.
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
    const { step, code } = body as Record<string, unknown>;
    if (step !== 'request' && step !== 'confirm' && step !== 'cancel') return refuse({ code: 'bad_request' });
    if (step === 'confirm' && (typeof code !== 'string' || !CODE.test(code))) return refuse({ code: 'bad_request' });
    try {
      const outcome = step === 'request' ? await service.request(userId) : step === 'confirm' ? await service.confirm(userId, code as string) : await service.cancel(userId);
      return outcome.ok ? respond(200, outcome) : refuse(outcome.error);
    } catch (error) {
      // Only the kind of error is logged: the message of a failure could echo what the request carried.
      console.error(`accounts-delete-account failed: ${error instanceof Error ? error.name : 'unknown'}`);
      return refuse({ code: 'internal' });
    }
  };
}
