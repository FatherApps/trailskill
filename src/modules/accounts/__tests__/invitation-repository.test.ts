import { createInMemoryInvitationRepository, createSupabaseInvitationRepository } from '../data/invitations';

const mockInsert = jest.fn();
const mockRpc = jest.fn();
jest.mock('../../../core/sync', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => mockRpc(name, args),
    from: (table: string) => ({
      insert: (row: unknown) => mockInsert(table, row),
    }),
  },
}));

// Synthetic ids and token only.
describe('Supabase invitation repository', () => {
  beforeEach(() => mockInsert.mockReset());

  it('inserts one school invitation for the group and returns the token and expiry the server generated', async () => {
    const single = jest.fn().mockResolvedValue({
      data: { token: 'f'.repeat(32), expires_at: '2026-11-08T10:00:00Z' },
      error: null,
    });
    mockInsert.mockReturnValue({
      select: (columns: string) => (columns === 'token, expires_at' ? { single } : null),
    });

    await expect(
      createSupabaseInvitationRepository().create({
        schoolId: 'school-1',
        groupId: 'group-1',
      }),
    ).resolves.toEqual({
      token: 'f'.repeat(32),
      expiresAt: '2026-11-08T10:00:00Z',
    });
    // The server picks the token, the expiry and the author: the device never sends them.
    expect(mockInsert).toHaveBeenCalledWith('school_invitations', {
      school_id: 'school-1',
      group_id: 'group-1',
    });
  });

  it('rejects when the server refuses the invitation', async () => {
    const error = { code: '42501', message: 'denied' };
    mockInsert.mockReturnValue({
      select: () => ({
        single: jest.fn().mockResolvedValue({ data: null, error }),
      }),
    });

    await expect(
      createSupabaseInvitationRepository().create({
        schoolId: 'school-1',
        groupId: 'group-1',
      }),
    ).rejects.toBe(error);
  });

  it('rejects with the error when there is no network and the client answers without a code', async () => {
    const error = { message: 'TypeError: Network request failed' };
    mockInsert.mockReturnValue({
      select: () => ({
        single: jest.fn().mockResolvedValue({ data: null, error }),
      }),
    });

    await expect(createSupabaseInvitationRepository().create({ schoolId: 'school-1', groupId: 'group-1' })).rejects.toBe(error);
  });
});

describe('Supabase invitation repository: resolve and accept', () => {
  beforeEach(() => mockRpc.mockReset());

  it('resolves a token to the school, the group and the categories', async () => {
    mockRpc.mockResolvedValue({
      data: { school_name: 'Escuela Delfines', group_name: 'Infantil B', categories: [{ id: 'c1', name: '9-10', sort_order: 1 }] },
      error: null,
    });
    await expect(createSupabaseInvitationRepository().resolve('tok')).resolves.toEqual({
      school: 'Escuela Delfines',
      group: 'Infantil B',
      categories: [{ id: 'c1', name: '9-10' }],
    });
    expect(mockRpc).toHaveBeenCalledWith('resolve_invitation', { token: 'tok' });
  });

  it('resolves an unknown, expired or revoked token to null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(createSupabaseInvitationRepository().resolve('tok')).resolves.toBeNull();
  });

  it('throws when the request fails', async () => {
    const error = { message: 'Network request failed' };
    mockRpc.mockResolvedValue({ data: null, error });
    await expect(createSupabaseInvitationRepository().resolve('tok')).rejects.toBe(error);
  });

  it('accepts with a category, or with null when there is none', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const repository = createSupabaseInvitationRepository();
    await repository.accept({ token: 'tok', athleteId: 'a1', categoryId: 'c1' });
    await repository.accept({ token: 'tok', athleteId: 'a1' });
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'accept_invitation', { token: 'tok', athlete_id: 'a1', category_id: 'c1' });
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'accept_invitation', { token: 'tok', athlete_id: 'a1', category_id: null });
  });

  it('throws when accepting fails', async () => {
    const error = { code: '42501', message: 'denied' };
    mockRpc.mockResolvedValue({ data: null, error });
    await expect(createSupabaseInvitationRepository().accept({ token: 'tok', athleteId: 'a1' })).rejects.toBe(error);
  });
});

describe('in-memory invitation repository', () => {
  it('records every invitation created, a new one each time', async () => {
    const repository = createInMemoryInvitationRepository();

    const first = await repository.create({
      schoolId: 'school-1',
      groupId: 'group-1',
    });
    const second = await repository.create({
      schoolId: 'school-1',
      groupId: 'group-1',
    });

    expect(first.token).not.toBe(second.token);
    expect(repository.created).toEqual([
      { schoolId: 'school-1', groupId: 'group-1' },
      { schoolId: 'school-1', groupId: 'group-1' },
    ]);
  });
});
