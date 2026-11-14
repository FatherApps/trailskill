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
