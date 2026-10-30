import { ProviderUnavailableError } from '../../../port.ts';
import { REQUEST_TIMEOUT_MS, fetchText } from '../fetchText.ts';

const URL_ = 'https://source.invalid/history';
const response = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

describe('fetchText', () => {
  afterEach(() => jest.useRealTimers());

  it('returns the body of a successful response, with one call and the given request', async () => {
    const fetchImpl = jest.fn(async () => response('<html></html>'));
    const init = { method: 'POST', body: 'a=1' };
    expect(await fetchText(fetchImpl, URL_, init)).toBe('<html></html>');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(URL_, expect.objectContaining(init));
  });

  it('allows 10 seconds', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(10_000);
  });

  it.each([404, 500, 503])('is unavailable on HTTP %i, without retrying', async (status) => {
    const fetchImpl = jest.fn(async () => response('error', { status }));
    await expect(fetchText(fetchImpl, URL_)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('is unavailable when the network fails, hiding the cause', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('connect ECONNREFUSED 0000000000');
    });
    const error = await fetchText(fetchImpl, URL_).catch((caught: unknown) => caught);
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
    const pending = fetchText(fetchImpl, URL_).catch((caught: unknown) => caught);
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
    const pending = fetchText(fetchImpl, URL_).catch((caught: unknown) => caught);
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await pending).toBeInstanceOf(ProviderUnavailableError);
  });
});
