import { selectSender } from '../selectSender.ts';
import { createInviteCoach } from '../service.ts';
import type { Invitation } from '../port.ts';
import { createMemoryStore, SCHOOL_NAME } from './fakes.ts';

const KEY = 're_test_not_a_real_key';
const FROM = 'Swimcro <no-reply@example.test>';
const SCHOOL = '11111111-1111-4111-8111-111111111111';
const INVITATION: Invitation = { id: 'invitation-1', schoolId: SCHOOL, email: 'coach@example.test', schoolName: SCHOOL_NAME };

function fakeFetch(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response('{}', { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const WARNING = 'school-console-invite-coach: RESEND_API_KEY is not set; invitations are recorded but no email is sent';

describe('selectSender', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it.each([
    ['undefined', undefined],
    ['empty', ''],
  ])('uses the test sender, which sends nothing, when the key is %s', async (_name, key) => {
    const { fetch, calls } = fakeFetch();
    const sender = selectSender({ RESEND_API_KEY: key, RESEND_FROM: FROM }, fetch);
    await expect(sender.deliver(INVITATION)).resolves.toBe(false);
    expect(calls).toEqual([]);
    expect((sender as { delivered?: Invitation[] }).delivered).toEqual([INVITATION]);
    expect(warn.mock.calls).toEqual([[WARNING]]);
  });

  it('uses Resend with the key and the sender address when both are set', async () => {
    const { fetch, calls } = fakeFetch(200);
    await expect(selectSender({ RESEND_API_KEY: KEY, RESEND_FROM: FROM }, fetch).deliver(INVITATION)).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(calls[0].init.body as string).from).toBe(FROM);
    expect(warn).not.toHaveBeenCalled();
  });

  it('fails every delivery, without calling Resend, when the key is set but the sender address is not', async () => {
    const { fetch, calls } = fakeFetch();
    const sender = selectSender({ RESEND_API_KEY: KEY }, fetch);
    await expect(sender.deliver(INVITATION)).rejects.toThrow('Resend sender is not configured');
    expect(calls).toEqual([]);

    const { store } = createMemoryStore([SCHOOL]);
    expect(await createInviteCoach({ store, sender })({ schoolId: SCHOOL, email: INVITATION.email })).toEqual({ ok: false, error: { code: 'unavailable', invitationId: 'invitation-1' } });
    expect(calls).toEqual([]);
  });
});
