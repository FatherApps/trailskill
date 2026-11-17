import { createResendSender } from '../resendSender.ts';

const KEY = 're_test_not_a_real_key';
const FROM = 'Swimcro <no-reply@example.test>';
const INVITATION = { id: 'invitation-1', schoolId: '11111111-1111-4111-8111-111111111111', email: 'coach@example.test', schoolName: 'Escuela de prueba' };

/** A fetch that records its calls and answers (or throws) what it was given. */
function fakeFetch(answer: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answer();
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

/** A response whose body stream records that it was cancelled. */
function trackedResponse(status: number) {
  const state = { cancelled: false };
  const body = new ReadableStream({ cancel: () => void (state.cancelled = true) });
  return { response: new Response(body, { status }), state };
}

const reason = async (promise: Promise<void>) => promise.then(() => '', (e: Error) => e.message);

describe('createResendSender', () => {
  it('sends one POST to Resend with the key, the sender, the coach and the texts, and resolves on 2xx', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{"id":"x"}', { status: 200 }));
    await createResendSender({ apiKey: KEY, from: FROM, fetch }).deliver(INVITATION);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({ Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });
    const body = JSON.parse(calls[0].init.body as string);
    expect(Object.keys(body).sort()).toEqual(['from', 'subject', 'text', 'to']);
    expect(body.from).toBe(FROM);
    expect(body.to).toEqual(['coach@example.test']);
    expect(body.subject).toContain('Escuela de prueba');
    expect(body.text).toContain('Escuela de prueba');
  });

  it.each([422, 500])('rejects on HTTP %s without the key, the response body or the email', async (status) => {
    const { fetch } = fakeFetch(() => new Response(`secret-body-detail ${KEY} coach@example.test`, { status }));
    const message = await reason(createResendSender({ apiKey: KEY, from: FROM, fetch }).deliver(INVITATION));
    expect(message).toBe(`Resend delivery failed (HTTP ${status})`);
  });

  it.each([200, 422])('releases the response body on HTTP %s', async (status) => {
    const { response, state } = trackedResponse(status);
    const { fetch } = fakeFetch(() => response);
    await reason(createResendSender({ apiKey: KEY, from: FROM, fetch }).deliver(INVITATION));
    expect(state.cancelled).toBe(true);
  });

  it('rejects when the request throws, without chaining what the error said', async () => {
    const { fetch } = fakeFetch(() => Promise.reject(new Error(`connect failed with ${KEY} for coach@example.test`)));
    const failure = createResendSender({ apiKey: KEY, from: FROM, fetch }).deliver(INVITATION);
    await expect(failure).rejects.toThrow(new Error('Resend delivery failed (network)'));
    const error = (await failure.catch((e: Error) => e)) as Error & { cause?: unknown };
    expect(error.message).not.toContain(KEY);
    expect(error.cause).toBeUndefined();
  });

  it('rejects without calling fetch when the sender address is not configured', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('', { status: 200 }));
    await expect(createResendSender({ apiKey: KEY, from: '', fetch }).deliver(INVITATION)).rejects.toThrow('Resend sender is not configured');
    expect(calls).toEqual([]);
  });
});
