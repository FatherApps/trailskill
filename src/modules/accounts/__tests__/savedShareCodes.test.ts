import { createInMemorySavedShareCodeRepository } from '../data/savedShareCodes';

jest.mock('../../../core/sync', () => ({ db: {}, supabase: {} }));

describe('the share codes kept from other families (issue #1302)', () => {
  it('lists only this person\'s codes, most recently kept first, and forgets one', async () => {
    const repository = createInMemorySavedShareCodeRepository([
      { id: 's1', userId: 'u1', code: 'TS-BBBBBB', athleteShortName: 'Ana M.', savedAt: '2026-11-20T10:00:00.000Z' },
      { id: 's2', userId: 'u1', code: 'TS-CCCCCC', athleteShortName: 'Luis P.', savedAt: '2026-11-21T10:00:00.000Z' },
      { id: 's3', userId: 'u2', code: 'TS-DDDDDD', athleteShortName: 'Eva R.', savedAt: '2026-11-21T10:00:00.000Z' },
    ]);
    expect((await repository.list('u1')).map((s) => s.code)).toEqual(['TS-CCCCCC', 'TS-BBBBBB']);
    await repository.forget('s2');
    expect((await repository.list('u1')).map((s) => s.code)).toEqual(['TS-BBBBBB']);
  });
});
