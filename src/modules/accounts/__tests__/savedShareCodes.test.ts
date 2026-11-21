import { db } from '../../../core/sync';
import { createInMemorySavedShareCodeRepository, createPowerSyncSavedShareCodeRepository } from '../data/savedShareCodes';

jest.mock('../../../core/sync', () => ({ db: { getAll: jest.fn() }, supabase: {} }));

const seed = [
  { id: 's1', userId: 'u1', code: 'TS-BBBBBB', athleteShortName: 'Ana M.', savedAt: '2026-11-20T10:00:00.000Z', expiredAt: '2026-11-21T09:00:00.000Z' },
  { id: 's2', userId: 'u1', code: 'TS-CCCCCC', athleteShortName: 'Luis P.', savedAt: '2026-11-21T10:00:00.000Z', expiredAt: null },
  { id: 's3', userId: 'u2', code: 'TS-DDDDDD', athleteShortName: 'Eva R.', savedAt: '2026-11-21T10:00:00.000Z', expiredAt: null },
];

describe('the share codes kept from other families (issues 1302, 1320)', () => {
  it('lists only this person\'s codes, most recently kept first, and forgets one', async () => {
    const repository = createInMemorySavedShareCodeRepository(seed.map((row) => ({ ...row, expiredAt: null })));
    expect((await repository.list('u1')).map((s) => s.code)).toEqual(['TS-CCCCCC', 'TS-BBBBBB']);
    await repository.forget('s2');
    expect((await repository.list('u1')).map((s) => s.code)).toEqual(['TS-BBBBBB']);
  });

  it('never lists an expired code unless the screen asks for it, and then says when it expired', async () => {
    const repository = createInMemorySavedShareCodeRepository(seed);
    expect((await repository.list('u1')).map((s) => s.code)).toEqual(['TS-CCCCCC']);
    expect((await repository.list('u1', { includeExpired: true })).map((s) => [s.code, s.expiredAt])).toEqual([
      ['TS-CCCCCC', null],
      ['TS-BBBBBB', '2026-11-21T09:00:00.000Z'],
    ]);
  });

  it('asks the synced rows for the current codes only by default, and for the expired ones too on request', async () => {
    const getAll = db.getAll as jest.Mock;
    getAll.mockResolvedValue([]);
    const repository = createPowerSyncSavedShareCodeRepository();
    await repository.list('u1');
    expect(getAll.mock.calls[0][0]).toContain('AND expired_at IS NULL');
    await repository.list('u1', { includeExpired: true });
    expect(getAll.mock.calls[1][0]).not.toContain('AND expired_at IS NULL');
    expect(getAll.mock.calls[1][0]).toContain('expired_at FROM');
  });

  it('reads expired_at from the synced rows: the time once expired, null when current or when an old server sent no column', async () => {
    (db.getAll as jest.Mock).mockResolvedValueOnce([
      { id: 's1', code: 'TS-BBBBBB', athlete_short_name: 'Ana M.', saved_at: 'a', expired_at: '2026-11-21T09:00:00.000Z' },
      { id: 's2', code: 'TS-CCCCCC', athlete_short_name: 'Luis P.', saved_at: 'b', expired_at: null },
      { id: 's3', code: 'TS-DDDDDD', athlete_short_name: 'Eva R.', saved_at: 'c' },
    ]);
    const list = await createPowerSyncSavedShareCodeRepository().list('u1', { includeExpired: true });
    expect(list.map((s) => s.expiredAt)).toEqual(['2026-11-21T09:00:00.000Z', null, null]);
  });
});
