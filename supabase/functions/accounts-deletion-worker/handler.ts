import type { RunSummary } from './service.ts';

export type HandlerDeps = {
  /** The shared secret (ACCOUNTS_WORKER_SECRET), or undefined when it is not configured. */
  secret: string | undefined;
  service: { run: () => Promise<RunSummary> };
};

/** Compares two strings in time that depends only on the longer one, not on where they differ. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  return diff === 0;
}

const respond = (status: number, body: unknown) => Response.json(body, { status });

/**
 * POST only, called by pg_cron through pg_net with the shared secret in `x-worker-secret`. A missing secret in the configuration, or
 * a missing or wrong header, answers 401 and nothing runs. Answers `{ ok: true, value: summary }`.
 */
export function createHandler({ secret, service }: HandlerDeps) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return respond(405, { ok: false, error: { code: 'bad_request' } });
    const given = request.headers.get('x-worker-secret');
    if (!secret || given === null || !safeEqual(given, secret)) return respond(401, { ok: false, error: { code: 'unauthenticated' } });
    try {
      return respond(200, { ok: true, value: await service.run() });
    } catch (error) {
      // Only the kind of error is logged: the message of a failure could echo what the run carried.
      console.error(`accounts-deletion-worker failed: ${error instanceof Error ? error.name : 'unknown'}`);
      return respond(500, { ok: false, error: { code: 'internal' } });
    }
  };
}
