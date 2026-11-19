import { DatabaseSync } from 'node:sqlite';

import { createStore, openDatabase, type FakeDatabase } from '../../../core/sync/testing/fakeDatabase';
import { createPowerSyncFamilyVideoRepository } from '..';

let mockDb: FakeDatabase;
jest.mock('../../../core/sync', () => ({
  get db() {
    return mockDb;
  },
}));

let store: { path: string; remove: () => void };
beforeEach(() => {
  store = createStore();
  const seed = new DatabaseSync(store.path);
  seed.exec(
    `CREATE TABLE family_timing_videos (id TEXT PRIMARY KEY, created_at TEXT, created_by TEXT, measurement_id TEXT, asset_id TEXT, start_offset_ms INTEGER);`,
  );
  seed.close();
  mockDb = openDatabase(store.path);
});
afterEach(() => store.remove());

describe('createPowerSyncFamilyVideoRepository', () => {
  it('links a time to its video and lists only the videos of that person', async () => {
    const videos = createPowerSyncFamilyVideoRepository();
    await videos.link('u1', { measurementId: 'm1', assetId: '41', startOffsetMillis: 3_200 });
    await videos.link('u2', { measurementId: 'm2', assetId: '42', startOffsetMillis: 0 });

    expect(await videos.listByUser('u1')).toEqual([{ measurementId: 'm1', assetId: '41', startOffsetMillis: 3_200 }]);
  });

  it('keeps one video per time: a new link replaces the old one', async () => {
    const videos = createPowerSyncFamilyVideoRepository();
    await videos.link('u1', { measurementId: 'm1', assetId: '41', startOffsetMillis: 3_200 });
    await videos.link('u1', { measurementId: 'm1', assetId: '43', startOffsetMillis: 1_000 });

    expect(await videos.listByUser('u1')).toEqual([{ measurementId: 'm1', assetId: '43', startOffsetMillis: 1_000 }]);
  });

  it('never queues the link for the server', async () => {
    const videos = createPowerSyncFamilyVideoRepository();
    await videos.link('u1', { measurementId: 'm1', assetId: '41', startOffsetMillis: 3_200 });

    expect(await mockDb.getAll('SELECT * FROM pending_writes')).toEqual([]);
  });
});
