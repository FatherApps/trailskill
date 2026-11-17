import type { CreateOutcome, Invitation, InvitationStore } from '../port.ts';
import { withSendLimit, type Rpc } from '../sendLimit.ts';

const INVITATION: Invitation = { id: 'invitation-1', schoolId: 'school-1', email: 'coach@example.test', schoolName: 'Escuela de prueba' };

const innerStore = (outcome: CreateOutcome = { ok: true, value: INVITATION }) => {
  const create = jest.fn(async () => outcome);
  return { store: { create } as InvitationStore, create };
};
const answering = (result: { data: unknown; error: { code?: string; message?: string } | null }) => jest.fn<ReturnType<Rpc>, Parameters<Rpc>>(async () => result);

describe('withSendLimit', () => {
  it('claims the send of the invitation the inner store answered, as the caller, and passes the outcome through', async () => {
    const { store, create } = innerStore();
    const rpc = answering({ data: 'claimed', error: null });
    expect(await withSendLimit(store, rpc).create('school-1', 'coach@example.test')).toEqual({ ok: true, value: INVITATION });
    expect(create).toHaveBeenCalledWith('school-1', 'coach@example.test');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('claim_coach_invitation_send', { invitation_id: 'invitation-1' });
  });

  it.each(['caller_rate_limited', 'recipient_rate_limited'])('answers %s as its own error code', async (code) => {
    const { store } = innerStore();
    expect(await withSendLimit(store, answering({ data: code, error: null })).create('school-1', 'coach@example.test')).toEqual({ ok: false, error: { code } });
  });

  it('answers not_authorized when the database refuses the caller (42501)', async () => {
    const { store } = innerStore();
    expect(await withSendLimit(store, answering({ data: null, error: { code: '42501' } })).create('school-1', 'coach@example.test')).toEqual({
      ok: false,
      error: { code: 'not_authorized' },
    });
  });

  it('throws with the Postgres code only, never the message, on any other error', async () => {
    const { store } = innerStore();
    const rpc = answering({ data: null, error: { code: '57014', message: 'coach@example.test secret' } });
    const failure = await withSendLimit(store, rpc).create('school-1', 'coach@example.test').catch((error: Error) => error);
    expect(failure).toEqual(new Error('Claiming the send failed (57014)'));
    expect((failure as Error).message).not.toContain('coach@example.test');
  });

  it('throws when the error has no code, or the answer is not a known claim', async () => {
    const { store } = innerStore();
    await expect(withSendLimit(store, answering({ data: null, error: {} })).create('s', 'e')).rejects.toThrow('Claiming the send failed (unknown)');
    await expect(withSendLimit(store, answering({ data: 'whatever', error: null })).create('s', 'e')).rejects.toThrow('Claiming the send failed (unknown)');
    await expect(withSendLimit(store, answering({ data: null, error: null })).create('s', 'e')).rejects.toThrow('Claiming the send failed (unknown)');
  });

  it.each<[string, CreateOutcome]>([
    ['not_authorized', { ok: false, error: { code: 'not_authorized' } }],
    ['bad_request', { ok: false, error: { code: 'bad_request' } }],
  ])('claims nothing when the inner store answered %s', async (_name, outcome) => {
    const { store } = innerStore(outcome);
    const rpc = answering({ data: 'claimed', error: null });
    expect(await withSendLimit(store, rpc).create('school-1', 'coach@example.test')).toEqual(outcome);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lets an inner store failure through, claiming nothing', async () => {
    const rpc = answering({ data: 'claimed', error: null });
    const store: InvitationStore = { create: async () => Promise.reject(new Error('boom')) };
    await expect(withSendLimit(store, rpc).create('s', 'e')).rejects.toThrow('boom');
    expect(rpc).not.toHaveBeenCalled();
  });
});
