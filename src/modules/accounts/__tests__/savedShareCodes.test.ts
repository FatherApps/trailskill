import { db } from '../../../core/sync';
import { createInMemorySavedShareCodeRepository, createPowerSyncSavedShareCodeRepository } from '../data/savedShareCodes';

jest.mock('../../../core/sync', () => ({ db: { getAll: jest.fn() }, supabase: {} }));

describe('the share codes kept from other families (issues 1302, 1320)', () => {
  it('lists only this person\'s codes, most recently kept first, with when each expired, and forgets one', async () => {
    const repository = createInMemorySavedShareCodeRepository([
      { id: 's1', userId: 'u1', code: 'TS-BBBBBB', athleteShortName: 'Ana M.', savedAt: '2026-11-20T10:00:00.000Z', expiredAt: '2026-11-21T09:00:00.000Z' },
      { id: 's2', userId: 'u1', code: 'TS-CCCCCC', athleteShortName: 'Luis P.', savedAt: '2026-11-21T10:00:00.000Z', expiredAt: null },
      { id: 's3', userId: 'u2', code: 'TS-DDDDDD', athleteShortName: 'Eva R.', savedAt: '2026-11-21T10:00:00.000Z', expiredAt: null },
    ]);
    expect((await repository.list('u1')).map((s) => [s.code, s.expiredAt])).toEqual([
      ['TS-CCCCCC', null],
      ['TS-BBBBBB', '2026-11-21T09:00:00.000Z'],
    ]);
    await repository.forget('s2');
    expect((await repository.list('u1')).map((s) => s.code)).toEqual(['TS-BBBBBB']);
  });

  it('reads expired_at from the synced rows: null while current, the time once expired, null for a row an old server sent', async () => {
    (db.getAll as jest.Mock).mockResolvedValueOnce([
      { id: 's1', code: 'TS-BBBBBB', athlete_short_name: 'Ana M.', saved_at: 'a', expired_at: '2026-11-21T09:00:00.000Z' },
      { id: 's2', code: 'TS-CCCCCC', athlete_short_name: 'Luis P.', saved_at: 'b', expired_at: null },
      { id: 's3', code: 'TS-DDDDDD', athlete_short_name: 'Eva R.', saved_at: 'c' },
    ]);
    const list = await createPowerSyncSavedShareCodeRepository().list('u1');
    expect(list.map((s) => s.expiredAt)).toEqual(['2026-11-21T09:00:00.000Z', null, null]);
    expect((db.getAll as jest.Mock).mock.calls[0][0]).toContain('expired_at');
  });
});
