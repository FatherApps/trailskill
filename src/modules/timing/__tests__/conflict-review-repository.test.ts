import {
  ConflictReviewError,
  classifyResolveError,
  createInMemoryConflictReviewRepository,
  createSupabaseConflictReviewRepository,
  type OpenConflict,
} from '../data/conflictReview';

const mockRpc = jest.fn();
jest.mock('../../../core/sync', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));

const conflict: OpenConflict = {
  id: 'conflict-1',
  expectedVersion: 3,
  athleteName: 'Ana Prueba',
  event: { stroke: 'FR', distance: '50m', pool: 'SCM' },
  current: { hundredths: 3520, author: 'Coach Uno', device: 'phone-a', at: '2026-10-25T14:00:00.000Z' },
  incoming: { hundredths: 3480, author: null, device: 'phone-b', at: '2026-10-25T14:05:00.000Z' },
};

describe('classifyResolveError', () => {
  it.each([
    [{ code: '42501' }, 200, 'forbidden'],
    [{ code: 'PT409' }, 409, 'stale'],
    [{ code: '' }, 409, 'stale'],
    [{ code: '55000' }, 400, 'resolved'],
    [{ code: '' }, 0, 'offline'],
    [{ code: '23514' }, 400, 'failed'],
    [{ code: 'P0002' }, 404, 'failed'],
  ])('maps %j with status %s to %s', (error, status, expected) => {
    expect(classifyResolveError(error, status)).toBe(expected);
  });
});

describe('in-memory conflict review repository', () => {
  it('lists the open conflicts and tells a platform admin apart', async () => {
    const repo = createInMemoryConflictReviewRepository({ conflicts: [conflict], admins: ['admin-1'] });
    expect(await repo.isPlatformAdmin('admin-1')).toBe(true);
    expect(await repo.isPlatformAdmin('someone')).toBe(false);
    expect(await repo.listOpen()).toEqual([conflict]);
  });

  it('resolves a conflict with the decision, the expected version and the reason, and stops listing it', async () => {
    const repo = createInMemoryConflictReviewRepository({ conflicts: [conflict] });
    await repo.resolve({ conflictId: 'conflict-1', expectedVersion: 3, decision: 'incoming', hundredths: null, reason: 'Cronómetro correcto' });
    expect(repo.resolved).toEqual([{ conflictId: 'conflict-1', expectedVersion: 3, decision: 'incoming', hundredths: null, reason: 'Cronómetro correcto' }]);
    expect(await repo.listOpen()).toEqual([]);
  });

  it('keeps a missing time as null and never as zero', async () => {
    const repo = createInMemoryConflictReviewRepository({ conflicts: [conflict] });
    await repo.resolve({ conflictId: 'conflict-1', expectedVersion: 3, decision: 'value', hundredths: null, reason: 'Sin tiempo' });
    expect(repo.resolved[0].hundredths).toBeNull();
  });

  it('rejects with the reason the server would give', async () => {
    const repo = createInMemoryConflictReviewRepository({ conflicts: [conflict] });
    repo.rejectWith = 'stale';
    await expect(
      repo.resolve({ conflictId: 'conflict-1', expectedVersion: 2, decision: 'current', hundredths: null, reason: 'x' }),
    ).rejects.toEqual(expect.objectContaining({ reason: 'stale' }));
    expect(await repo.listOpen()).toEqual([conflict]);
  });

  it('fails as offline without touching the conflict', async () => {
    const repo = createInMemoryConflictReviewRepository({ conflicts: [conflict], offline: true });
    const attempt = repo.resolve({ conflictId: 'conflict-1', expectedVersion: 3, decision: 'current', hundredths: null, reason: 'x' });
    await expect(attempt).rejects.toBeInstanceOf(ConflictReviewError);
    await expect(attempt).rejects.toEqual(expect.objectContaining({ reason: 'offline' }));
    repo.offline = false;
    expect(await repo.listOpen()).toEqual([conflict]);
    expect(repo.resolved).toEqual([]);
  });
});

describe('Supabase conflict review repository', () => {
  beforeEach(() => mockRpc.mockReset());

  it('sends the decision, the expected version and the reason to the server function', async () => {
    mockRpc.mockResolvedValue({ data: 'resolution-1', error: null, status: 200 });
    await createSupabaseConflictReviewRepository().resolve({
      conflictId: 'conflict-1',
      expectedVersion: 3,
      decision: 'value',
      hundredths: 3450,
      reason: 'Revisado en video',
    });
    expect(mockRpc).toHaveBeenCalledWith('resolve_measurement_conflict', {
      conflict_id: 'conflict-1',
      expected_version: 3,
      decision: 'value',
      hundredths: 3450,
      reason: 'Revisado en video',
    });
  });

  it('sends a missing time as null, never as zero, and no time at all for a chosen version', async () => {
    mockRpc.mockResolvedValue({ data: 'resolution-1', error: null, status: 200 });
    const repo = createSupabaseConflictReviewRepository();
    await repo.resolve({ conflictId: 'c', expectedVersion: 1, decision: 'value', hundredths: null, reason: 'Sin tiempo' });
    await repo.resolve({ conflictId: 'c', expectedVersion: 1, decision: 'current', hundredths: 3450, reason: 'Gana la actual' });
    expect(mockRpc.mock.calls[0][1].hundredths).toBeNull();
    expect(mockRpc.mock.calls[1][1].hundredths).toBeNull();
  });

  it('turns a server rejection into its reason', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PT409' }, status: 409 });
    await expect(
      createSupabaseConflictReviewRepository().resolve({ conflictId: 'c', expectedVersion: 1, decision: 'current', hundredths: null, reason: 'x' }),
    ).rejects.toEqual(expect.objectContaining({ reason: 'stale' }));
  });

  it('reports a request that never reached the server as offline', async () => {
    mockRpc.mockRejectedValue(new TypeError('Network request failed'));
    await expect(
      createSupabaseConflictReviewRepository().resolve({ conflictId: 'c', expectedVersion: 1, decision: 'current', hundredths: null, reason: 'x' }),
    ).rejects.toEqual(expect.objectContaining({ reason: 'offline' }));
  });
});
