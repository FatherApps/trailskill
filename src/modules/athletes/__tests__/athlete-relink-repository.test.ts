import {
  createInMemoryAthleteRelinkRepository,
  createSupabaseAthleteRelinkRepository,
  type InMemoryRelinkWorld,
} from '..';

// The Supabase client is never reached: the repository takes a fake with the one method it uses.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));

// Synthetic data only. The key is made up.
const KEY = 'AAAA-BBBB-CCCC-DDDD-EEEE';
const MAIN_CODE = 'TR-AAAA-BBBB-CCCC-DDDD';
const RECOVERY_CODE = 'RC-EEEE-FFFF-GGGG-HHHH';

describe('Supabase athlete relink repository', () => {
  const ok = (data: unknown) => ({ rpc: jest.fn().mockResolvedValue({ data, error: null }) });

  it('asks with the athlete and the key the family typed, and answers what the server answered', async () => {
    const client = ok('requested');

    await expect(createSupabaseAthleteRelinkRepository(client).request('a1', KEY)).resolves.toBe('requested');

    expect(client.rpc).toHaveBeenCalledWith('request_athlete_relink', { p_athlete: 'a1', p_key: KEY });
  });

  it.each(['already_requested', 'nothing_to_relink', 'invalid_key', 'rate_limited'] as const)('passes %s through as an answer, not an error', async (answer) => {
    await expect(createSupabaseAthleteRelinkRepository(ok(answer)).request('a1', KEY)).resolves.toBe(answer);
  });

  it('lists the requests of a swimmer with camelCase fields', async () => {
    const client = ok([{ id: 'r1', created_at: '2026-11-22T10:00:00+00:00', status: 'pending', school_name: 'School A', resolved_at: null, moved_count: null }]);

    await expect(createSupabaseAthleteRelinkRepository(client).listForAthlete('a1')).resolves.toEqual([
      { id: 'r1', createdAt: '2026-11-22T10:00:00+00:00', status: 'pending', schoolName: 'School A', resolvedAt: null, movedCount: null },
    ]);
    expect(client.rpc).toHaveBeenCalledWith('athlete_relink_requests_for_manager', { p_athlete: 'a1' });
  });

  it('lists the inbox of a school', async () => {
    const client = ok([
      {
        id: 'r1', created_at: '2026-11-22T10:00:00+00:00', status: 'pending', athlete_first_name: 'Ana', athlete_last_name: 'Test',
        times_count: 3, resolved_at: null, moved_count: null,
      },
    ]);

    await expect(createSupabaseAthleteRelinkRepository(client).listForSchool('s1')).resolves.toEqual([
      {
        id: 'r1', createdAt: '2026-11-22T10:00:00+00:00', status: 'pending', athleteFirstName: 'Ana', athleteLastName: 'Test',
        timesCount: 3, resolvedAt: null, movedCount: null,
      },
    ]);
    expect(client.rpc).toHaveBeenCalledWith('school_relink_requests', { p_school: 's1' });
  });

  it('approves or rejects with the request id and reads how many times moved', async () => {
    const client = ok({ status: 'approved', moved: 2 });

    await expect(createSupabaseAthleteRelinkRepository(client).resolve('r1', true)).resolves.toEqual({ status: 'approved', moved: 2 });
    expect(client.rpc).toHaveBeenCalledWith('resolve_athlete_relink', { p_request: 'r1', p_approve: true });
  });

  it('reads a decision someone else already made as moved 0', async () => {
    await expect(createSupabaseAthleteRelinkRepository(ok({ status: 'already_resolved' })).resolve('r1', true)).resolves.toEqual({
      status: 'already_resolved',
      moved: 0,
    });
  });

  it('maps the refusal of the database (42501) to not_allowed on every method', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: null, error: Object.assign(new Error('db'), { code: '42501' }) }) };
    const repo = createSupabaseAthleteRelinkRepository(client);

    await expect(repo.request('a1', KEY)).rejects.toThrow('not_allowed');
    await expect(repo.listForAthlete('a1')).rejects.toThrow('not_allowed');
    await expect(repo.listForSchool('s1')).rejects.toThrow('not_allowed');
    await expect(repo.resolve('r1', true)).rejects.toThrow('not_allowed');
  });

  it('rejects with the original error for anything else, offline included', async () => {
    const failure = Object.assign(new Error('Failed to fetch'), { code: '' });
    const client = { rpc: jest.fn().mockResolvedValue({ data: null, error: failure }) };

    await expect(createSupabaseAthleteRelinkRepository(client).request('a1', KEY)).rejects.toBe(failure);
  });
});

describe('in-memory athlete relink repository', () => {
  const world = (): InMemoryRelinkWorld => ({
    markers: [{ key: KEY, schools: [{ schoolId: 's1', schoolName: 'School A', times: 2 }, { schoolId: 's2', schoolName: 'School B', times: 1 }] }],
    managed: [{ athleteId: 'a1', firstName: 'Ana', lastName: 'Test' }],
    adminSchoolIds: ['s1'],
  });

  it('creates one pending request per school with times, and asking again is the same request', async () => {
    const repo = createInMemoryAthleteRelinkRepository(world());

    await expect(repo.request('a1', KEY)).resolves.toBe('requested');
    await expect(repo.request('a1', ' aaaa bbbb-cccc-dddd-eeee ')).resolves.toBe('already_requested');

    await expect(repo.listForAthlete('a1')).resolves.toHaveLength(2);
  });

  it('answers invalid_key to a wrong key, creates nothing, and limits the wrong keys per swimmer', async () => {
    const repo = createInMemoryAthleteRelinkRepository(world());

    for (let attempt = 0; attempt < 5; attempt += 1) await expect(repo.request('a1', 'FFFF-FFFF-FFFF-FFFF-FFFF')).resolves.toBe('invalid_key');
    await expect(repo.request('a1', KEY)).resolves.toBe('rate_limited');

    await expect(repo.listForAthlete('a1')).resolves.toEqual([]);
  });

  it('refuses a swimmer the caller does not manage', async () => {
    await expect(createInMemoryAthleteRelinkRepository(world()).request('other', KEY)).rejects.toThrow('not_allowed');
  });

  it('shows the inbox only to an admin of the school and approving moves the times once', async () => {
    const repo = createInMemoryAthleteRelinkRepository(world());
    await repo.request('a1', KEY);

    await expect(repo.listForSchool('s2')).rejects.toThrow('not_allowed');
    const [pending] = await repo.listForSchool('s1');
    expect(pending).toMatchObject({ athleteFirstName: 'Ana', timesCount: 2, status: 'pending' });

    await expect(repo.resolve(pending.id, true)).resolves.toEqual({ status: 'approved', moved: 2 });
    await expect(repo.resolve(pending.id, true)).resolves.toEqual({ status: 'already_resolved', moved: 0 });
    // School B's request is still open and school A has no times left, so asking again creates nothing.
    await expect(repo.request('a1', KEY)).resolves.toBe('already_requested');
  });

  it('rejecting moves nothing, and the other school is not the caller\'s to decide', async () => {
    const data = world();
    const repo = createInMemoryAthleteRelinkRepository(data);
    await repo.request('a1', KEY);
    const [own] = await repo.listForSchool('s1');

    await expect(repo.resolve(own.id, false)).resolves.toEqual({ status: 'rejected', moved: 0 });

    expect(data.markers[0].schools[0].times).toBe(2);
    const [family] = (await repo.listForAthlete('a1')).filter((r) => r.schoolName === 'School B');
    await expect(repo.resolve(family.id, true)).rejects.toThrow('not_allowed');
  });

  it('answers nothing_to_relink once every time was moved', async () => {
    const data = world();
    data.adminSchoolIds = ['s1', 's2'];
    const repo = createInMemoryAthleteRelinkRepository(data);
    await repo.request('a1', KEY);
    for (const r of await repo.listForSchool('s1')) await repo.resolve(r.id, true);
    for (const r of await repo.listForSchool('s2')) await repo.resolve(r.id, true);

    await expect(repo.request('a1', KEY)).resolves.toBe('nothing_to_relink');
  });

  it('takes a permanent code or a single-use recovery code, and never mixes them with the key of an erased swimmer', async () => {
    const data = world();
    data.markers[0].codes = [MAIN_CODE, RECOVERY_CODE];
    const repo = createInMemoryAthleteRelinkRepository(data);

    await expect(repo.request('a1', ' rc eeee-ffff-gggg-hhhh ')).resolves.toBe('requested');
    await expect(repo.request('a1', RECOVERY_CODE)).resolves.toBe('invalid_key');
    await expect(repo.request('a1', ' tr-aaaa-bbbb-cccc-dddd ')).resolves.toBe('already_requested');
    // A key of the other kind is not a code, and a code is not a key.
    data.markers[0].codes = ['TR-FFFF-FFFF-FFFF-FFFF'];
    await expect(repo.request('a1', 'TR-FFFF-FFFF-FFFF-FFFF')).resolves.toBe('already_requested');
    await expect(repo.request('a1', 'FFFFFFFFFFFFFFFFFFFF')).resolves.toBe('invalid_key');
  });

  it('does not spend a recovery code when there is nothing left to relink', async () => {
    const data = world();
    data.markers[0].codes = [RECOVERY_CODE];
    data.markers[0].schools.forEach((s) => (s.times = 0));
    const repo = createInMemoryAthleteRelinkRepository(data);

    await expect(repo.request('a1', RECOVERY_CODE)).resolves.toBe('nothing_to_relink');
    expect(data.markers[0].codes).toEqual([RECOVERY_CODE]);
  });
});
