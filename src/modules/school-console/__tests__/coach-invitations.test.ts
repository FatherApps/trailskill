import { createInMemoryCoachInvitationRepository, createSupabaseCoachInvitationRepository } from '../data/coachInvitations';

// The adapter takes the client as a parameter; the default one needs the sync layer mocked.
jest.mock('../../../core/sync', () => ({ supabase: {} }));

describe('in-memory coach invitation repository', () => {
  it('keeps the whole invitation with the school it was sent for', async () => {
    const repository = createInMemoryCoachInvitationRepository();

    await repository.invite('school-a', { name: 'Rosa', email: 'rosa@example.com', groupIds: ['g1', 'g2'] });

    expect(repository.sent).toEqual([{ schoolId: 'school-a', invitation: { name: 'Rosa', email: 'rosa@example.com', groupIds: ['g1', 'g2'] } }]);
  });
});

describe('supabase coach invitation repository', () => {
  const invitation = { name: 'Rosa', email: 'rosa@example.com', groupIds: ['g1'] };
  const clientAnswering = (answer: { data?: unknown; error?: unknown }) => {
    const invoke = jest.fn().mockResolvedValue({ data: null, error: null, ...answer });
    return { invoke, client: { functions: { invoke } } };
  };

  const refusal = (body: unknown) => ({ name: 'FunctionsHttpError', context: { json: async () => body } });

  it('reports the email as sent for a 200 with emailSent true, and for an old function that does not say', async () => {
    const sent = clientAnswering({ data: { ok: true, value: { invitationId: 'i1', emailSent: true } } });
    const old = clientAnswering({ data: { ok: true, value: { invitationId: 'i1' } } });

    await expect(createSupabaseCoachInvitationRepository(sent.client).invite('school-a', invitation)).resolves.toEqual({ emailSent: true });
    await expect(createSupabaseCoachInvitationRepository(old.client).invite('school-a', invitation)).resolves.toEqual({ emailSent: true });
  });

  it('reports the email as not sent for a 200 with emailSent false', async () => {
    const { client } = clientAnswering({ data: { ok: true, value: { invitationId: 'i1', emailSent: false } } });

    await expect(createSupabaseCoachInvitationRepository(client).invite('school-a', invitation)).resolves.toEqual({ emailSent: false });
  });

  it('resolves as not sent when the mail provider failed but the pending invitation exists', async () => {
    const { client } = clientAnswering({ error: refusal({ ok: false, error: { code: 'unavailable', invitationId: 'i1' } }) });

    await expect(createSupabaseCoachInvitationRepository(client).invite('school-a', invitation)).resolves.toEqual({ emailSent: false });
  });

  it('still rejects as unavailable when an old function does not say which invitation exists', async () => {
    const { client } = clientAnswering({ error: refusal({ ok: false, error: { code: 'unavailable' } }) });

    await expect(createSupabaseCoachInvitationRepository(client).invite('school-a', invitation)).rejects.toMatchObject({ name: 'CoachInvitationError', code: 'unavailable' });
  });

  it('rejects with the send-limit code', async () => {
    const { client } = clientAnswering({ error: refusal({ ok: false, error: { code: 'caller_rate_limited' } }) });

    await expect(createSupabaseCoachInvitationRepository(client).invite('school-a', invitation)).rejects.toMatchObject({ code: 'caller_rate_limited' });
  });

  it('calls the function with the school and the email only', async () => {
    const { invoke, client } = clientAnswering({ data: { ok: true, value: { invitationId: 'i1' } } });

    await createSupabaseCoachInvitationRepository(client).invite('school-a', invitation);

    expect(invoke).toHaveBeenCalledWith('school-console-invite-coach', { body: { schoolId: 'school-a', email: 'rosa@example.com' } });
  });

  it('rejects with the code the server refused with, never its message', async () => {
    const error = { name: 'FunctionsHttpError', context: { json: async () => ({ ok: false, error: { code: 'not_authorized' } }) } };
    const { client } = clientAnswering({ error });

    await expect(createSupabaseCoachInvitationRepository(client).invite('school-a', invitation)).rejects.toMatchObject({ name: 'CoachInvitationError', code: 'not_authorized' });
  });

  it('rejects as offline when the request never reached the server', async () => {
    const { client } = clientAnswering({ error: { name: 'FunctionsFetchError' } });

    await expect(createSupabaseCoachInvitationRepository(client).invite('school-a', invitation)).rejects.toMatchObject({ code: 'offline' });
  });

  it('rejects as unexpected when the refusal has no readable body', async () => {
    const { client } = clientAnswering({ error: { name: 'FunctionsHttpError', context: { json: async () => Promise.reject(new Error('x')) } } });

    await expect(createSupabaseCoachInvitationRepository(client).invite('school-a', invitation)).rejects.toMatchObject({ code: 'unexpected' });
  });
});
