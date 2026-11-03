import { ProviderUnavailableError, SourceUnreachableError } from '../../port.ts';

export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * One request, one answer: no retries and no background work. A failure, an HTTP error or a source that does not answer
 * in time is a typed "unavailable"; the cause is dropped on purpose so no number can leak through it. A network failure, a
 * timeout and an HTTP 5xx are `SourceUnreachableError` (trying again soon may work); an HTTP 4xx is not.
 * An `init.signal` from the caller (the total time of a search) aborts this request too.
 */
export async function fetchPage(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  url: string,
  init: RequestInit = {},
): Promise<{ body: string; setCookie: string | null }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const outer = init.signal;
  if (outer?.aborted) abort();
  else outer?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      // Not read, so the connection would hang on an unread body: cancel it, without waiting for the answer.
      response.body?.cancel().catch(() => undefined);
      throw response.status >= 500 ? new SourceUnreachableError() : new ProviderUnavailableError();
    }
    // The timer keeps running while the body downloads, so a stalled body is aborted too.
    return { body: await response.text(), setCookie: response.headers.get('set-cookie') };
  } catch (error) {
    // Our own typed errors pass; anything else (fetch rejecting, abort, a stalled body) is the source not answering.
    throw error instanceof ProviderUnavailableError ? error : new SourceUnreachableError();
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', abort);
  }
}
