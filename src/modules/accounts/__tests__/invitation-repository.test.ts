import { createInMemoryInvitationRepository, createSupabaseInvitationRepository } from '../data/invitations';

const mockInsert = jest.fn();
jest.mock('../../../core/sync', () => ({
  supabase: {
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
