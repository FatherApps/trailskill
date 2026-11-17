import { createResendSender, RESEND_TIMEOUT_MS } from '../resendSender.ts';

const KEY = 're_test_not_a_real_key';
const FROM = 'Swimcro <no-reply@example.test>';
const INVITATION = { id: 'invitation-1', schoolId: '11111111-1111-4111-8111-111111111111', email: 'coach@example.test', schoolName: 'Escuela de prueba' };

/** A fetch that records its calls and answers (or throws) what it was given. */
function fakeFetch(answer: () => Response | Promise<Response>, answerWith?: (init: RequestInit) => Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return answerWith ? answerWith(init) : answer();
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

/** A response whose body stream records that it was cancelled. */
function trackedResponse(status: number) {
  const state = { cancelled: false };
  const body = new ReadableStream({ cancel: () => void (state.cancelled = true) });
  return { response: new Response(body, { status }), state };
}

/** Like a real fetch: it never answers on its own, and rejects with the signal's reason once the signal aborts. */
const fetchUntilAborted = () =>
  fakeFetch(
    () => undefined as never,
    (init) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
  );

const reason = async (promise: Promise<void>) => promise.then(() => '', (e: Error) => e.message);

describe('createResendSender', () => {
  it('sends one POST to Resend with the key, the sender, the coach and the texts, and resolves on 2xx', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{"id":"x"}', { status: 200 }));
    await createResendSender({ apiKey: KEY, from: FROM, fetch }).deliver(INVITATION);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'coach-invitation/invitation-1',
    });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(calls[0].init.body as string);
    expect(Object.keys(body).sort()).toEqual(['from', 'subject', 'text', 'to']);
    expect(body.from).toBe(FROM);
    expect(body.to).toEqual(['coach@example.test']);
    expect(body.subject).toContain('Escuela de prueba');
    expect(body.text).toContain('Escuela de prueba');
  });

  it.each([409, 422, 500])('rejects on HTTP %s without the key, the response body, the invitation id or the email', async (status) => {
    const { fetch } = fakeFetch(() => new Response(`secret-body-detail ${KEY} coach@example.test`, { status }));
    const message = await reason(createResendSender({ apiKey: KEY, from: FROM, fetch }).deliver(INVITATION));
    expect(message).toBe(`Resend delivery failed (HTTP ${status})`);
    expect(message).not.toContain(INVITATION.id);
  });

  it('sends the same Idempotency-Key for the same invitation, and another for another invitation', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{}', { status: 200 }));
    const sender = createResendSender({ apiKey: KEY, from: FROM, fetch });
    await sender.deliver(INVITATION);
    await sender.deliver(INVITATION);
    await sender.deliver({ ...INVITATION, id: 'invitation-2' });
    const keys = calls.map((c) => (c.init.headers as Record<string, string>)['Idempotency-Key']);
    expect(keys).toEqual(['coach-invitation/invitation-1', 'coach-invitation/invitation-1', 'coach-invitation/invitation-2']);
  });

  it('gives up after the timeout like a network failure, saying nothing of the key, the invitation id or the email', async () => {
    const { fetch, calls } = fetchUntilAborted();
    const message = await reason(createResendSender({ apiKey: KEY, from: FROM, fetch, timeoutMs: 20 }).deliver(INVITATION));
    expect(message).toBe('Resend delivery failed (network)');
    for (const secret of [KEY, INVITATION.id, INVITATION.email]) expect(message).not.toContain(secret);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('waits RESEND_TIMEOUT_MS by default', () => {
    expect(RESEND_TIMEOUT_MS).toBe(10_000);
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
    expect(error.message).not.toContain(INVITATION.id);
    expect(error.cause).toBeUndefined();
  });

  it('rejects without calling fetch when the sender address is not configured', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('', { status: 200 }));
    await expect(createResendSender({ apiKey: KEY, from: '', fetch }).deliver(INVITATION)).rejects.toThrow('Resend sender is not configured');
    expect(calls).toEqual([]);
  });
});
