import { ProviderUnavailableError } from '../../../port.ts';
import { REQUEST_TIMEOUT_MS, fetchPage } from '../fetchPage.ts';

const URL_ = 'https://source.invalid/history';
const response = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

describe('fetchPage', () => {
  afterEach(() => jest.useRealTimers());

  it('returns the body of a successful response, with one call and the given request', async () => {
    const fetchImpl = jest.fn(async () => response('<html></html>'));
    const init = { method: 'POST', body: 'a=1' };
    expect((await fetchPage(fetchImpl, URL_, init)).body).toBe('<html></html>');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(URL_, expect.objectContaining(init));
  });

  it('hands back the cookie the source sets', async () => {
    const fetchImpl = jest.fn(async () => response('ok', { headers: { 'set-cookie': 'SESSION=abc; HttpOnly; secure' } }));
    expect((await fetchPage(fetchImpl, URL_)).setCookie).toBe('SESSION=abc; HttpOnly; secure');
  });

  it('allows 10 seconds', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(10_000);
  });

  it.each([404, 500, 503])('is unavailable on HTTP %i, without retrying', async (status) => {
    const fetchImpl = jest.fn(async () => response('error', { status }));
    await expect(fetchPage(fetchImpl, URL_)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('cancels the body of a response that is not OK before discarding it', async () => {
    const cancel = jest.fn();
    const fetchImpl = jest.fn(async () => new Response(new ReadableStream({ cancel }), { status: 503 }));
    await expect(fetchPage(fetchImpl, URL_)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('aborts the request when the caller\'s signal aborts', async () => {
    const outer = new AbortController();
    let seen: AbortSignal | null | undefined;
    const fetchImpl = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          seen = init?.signal;
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const pending = fetchPage(fetchImpl, URL_, { signal: outer.signal }).catch((caught: unknown) => caught);
    outer.abort();
    expect(await pending).toBeInstanceOf(ProviderUnavailableError);
    expect(seen?.aborted).toBe(true);
  });

  it('is unavailable when the network fails, hiding the cause', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('connect ECONNREFUSED 0000000000');
    });
    const error = await fetchPage(fetchImpl, URL_).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect((error as Error).message).not.toContain('0000000000');
    expect((error as Error).cause).toBeUndefined();
  });

  it('aborts and is unavailable when the source does not answer in time, without retrying', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const pending = fetchPage(fetchImpl, URL_).catch((caught: unknown) => caught);
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await pending).toBeInstanceOf(ProviderUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('is unavailable when the body stalls after the headers', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      const stalled = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
        },
      });
      return new Response(stalled, { status: 200 });
    });
    const pending = fetchPage(fetchImpl, URL_).catch((caught: unknown) => caught);
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await pending).toBeInstanceOf(ProviderUnavailableError);
  });
});
