import { ProviderUnavailableError } from '../../port.ts';

export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * One request, one answer: no retries and no background work. A failure, an HTTP error or a source that does not answer
 * in time is the same typed "unavailable"; the cause is dropped on purpose so no number can leak through it.
 */
export async function fetchText(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, url: string, init: RequestInit = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new ProviderUnavailableError();
    // The timer keeps running while the body downloads, so a stalled body is aborted too.
    return await response.text();
  } catch {
    throw new ProviderUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}
