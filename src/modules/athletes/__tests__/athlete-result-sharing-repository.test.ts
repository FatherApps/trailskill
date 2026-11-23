import { createInMemoryAthleteResultSharingRepository, createPowerSyncAthleteResultSharingRepository, type AthleteResultSharingEntry } from '..';

const mockGetAll = jest.fn();
// The Supabase client and the local database are never reached: the repository takes a fake client, and the database is a spy.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: { getAll: (...args: unknown[]) => mockGetAll(...args) } }));

// Synthetic data only.
const row = (athleteId: string, schoolId: string, revokedAt: string | null = null): AthleteResultSharingEntry => ({ athleteId, schoolId, revokedAt });

describe('PowerSync athlete result sharing repository', () => {
  beforeEach(() => mockGetAll.mockReset());

  it('reads the schools in force of the swimmer from the local table, never a withdrawn one', async () => {
    mockGetAll.mockResolvedValue([{ schoolId: 's2' }, { schoolId: 's3' }]);

    const schools = await createPowerSyncAthleteResultSharingRepository({ rpc: jest.fn() }).listSharedSchools('a1');

    expect(schools).toEqual(['s2', 's3']);
    const [sql, params] = mockGetAll.mock.calls[0];
    expect(sql).toContain('FROM athlete_result_sharing');
    expect(sql).toContain('revoked_at IS NULL');
    expect(params).toEqual(['a1']);
  });

  it('grants with grant_athlete_result_sharing and the ids of the swimmer and the school', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: 'row-1', error: null }) };

    await expect(createPowerSyncAthleteResultSharingRepository(client).grant('a1', 's2')).resolves.toBeUndefined();

    expect(client.rpc).toHaveBeenCalledWith('grant_athlete_result_sharing', { athlete: 'a1', school: 's2' });
  });

  it('revokes with revoke_athlete_result_sharing and the ids of the swimmer and the school', async () => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: 1, error: null }) };

    await expect(createPowerSyncAthleteResultSharingRepository(client).revoke('a1', 's2')).resolves.toBeUndefined();

    expect(client.rpc).toHaveBeenCalledWith('revoke_athlete_result_sharing', { athlete: 'a1', school: 's2' });
  });

  it.each([
    ['42501', 'not_allowed'],
    ['22023', 'not_active'],
  ])('maps the database error %s to %s', async (code, message) => {
    const client = { rpc: jest.fn().mockResolvedValue({ data: null, error: Object.assign(new Error('db'), { code }) }) };

    await expect(createPowerSyncAthleteResultSharingRepository(client).grant('a1', 's2')).rejects.toThrow(message);
  });

  it('rejects with the original error for anything else, offline included', async () => {
    const failure = Object.assign(new Error('Failed to fetch'), { code: '' });
    const client = { rpc: jest.fn().mockResolvedValue({ data: null, error: failure }) };

    await expect(createPowerSyncAthleteResultSharingRepository(client).revoke('a1', 's2')).rejects.toBe(failure);
  });
});

describe('in-memory athlete result sharing repository', () => {
  it('lists the schools in force of the swimmer by school id, without the withdrawn ones or other swimmers', async () => {
    const repository = createInMemoryAthleteResultSharingRepository([row('a1', 's3'), row('a1', 's2'), row('a1', 's4', '2026-11-22'), row('a2', 's2')]);

    await expect(repository.listSharedSchools('a1')).resolves.toEqual(['s2', 's3']);
  });

  it('a grant adds the row once and a revoke withdraws it, as the local table would show after the sync', async () => {
    const rows: AthleteResultSharingEntry[] = [];
    const repository = createInMemoryAthleteResultSharingRepository(rows);

    await repository.grant('a1', 's2');
    await repository.grant('a1', 's2');
    expect(await repository.listSharedSchools('a1')).toEqual(['s2']);

    await repository.revoke('a1', 's2');
    expect(await repository.listSharedSchools('a1')).toEqual([]);
  });

  it('fails like the server when the caller does not manage the swimmer', async () => {
    const repository = createInMemoryAthleteResultSharingRepository([], { managedIds: [] });

    await expect(repository.grant('a1', 's2')).rejects.toThrow('not_allowed');
    await expect(repository.revoke('a1', 's2')).rejects.toThrow('not_allowed');
  });
});
