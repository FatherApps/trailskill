import { createSupabaseAthleteAnonymousCopyRepository } from '..';

// The Supabase client is never reached: the repository takes a fake with the one method it uses.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));

const ok = (data: unknown) => ({ rpc: jest.fn().mockResolvedValue({ data, error: null }) });
const failing = (code: string, message: string) => ({
  rpc: jest.fn().mockResolvedValue({ data: null, error: Object.assign(new Error(message), { code }) }),
});

describe('Supabase athlete anonymous copy repository', () => {
  it('copies a swimmer of a school and reads the answer with camelCase fields', async () => {
    const client = ok({ status: 'created', athlete_id: 'anon-1', linkable: false, copied: 3 });

    await expect(createSupabaseAthleteAnonymousCopyRepository(client).create('a1', 's1')).resolves.toEqual({
      status: 'created',
      athleteId: 'anon-1',
      linkable: false,
      copied: 3,
    });
    expect(client.rpc).toHaveBeenCalledWith('create_anonymous_school_copy', { p_athlete: 'a1', p_school: 's1' });
  });

  it('lists the anonymous swimmers of a school: no name, no code, no identity', async () => {
    const client = ok([{ athlete_id: 'anon-1', created_at: '2026-11-22T10:00:00+00:00', linkable: true, times_count: 4 }]);

    await expect(createSupabaseAthleteAnonymousCopyRepository(client).list('s1')).resolves.toEqual([
      { athleteId: 'anon-1', createdAt: '2026-11-22T10:00:00+00:00', linkable: true, timesCount: 4 },
    ]);
    expect(client.rpc).toHaveBeenCalledWith('school_anonymous_copies', { p_school: 's1' });
  });

  it('maps the refusal of the database (42501) to not_allowed on both methods', async () => {
    const repo = createSupabaseAthleteAnonymousCopyRepository(failing('42501', 'denied'));

    await expect(repo.create('a1', 's1')).rejects.toThrow('not_allowed');
    await expect(repo.list('s1')).rejects.toThrow('not_allowed');
  });

  it.each(['no_school_access', 'already_anonymous'])('keeps the name of the rule %s raised by the server', async (rule) => {
    await expect(createSupabaseAthleteAnonymousCopyRepository(failing('P0001', rule)).create('a1', 's1')).rejects.toThrow(rule);
  });

  it('rejects with the original error for anything else, offline included', async () => {
    const failure = Object.assign(new Error('Failed to fetch'), { code: '' });
    const client = { rpc: jest.fn().mockResolvedValue({ data: null, error: failure }) };

    await expect(createSupabaseAthleteAnonymousCopyRepository(client).create('a1', 's1')).rejects.toBe(failure);
  });
});
