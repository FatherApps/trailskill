import { createStorageApi, createStorageDrainStore } from '../storageAdapters.ts';

const NOW = new Date('2026-12-01T12:00:00.000Z');
const ok = (data: unknown) => async () => ({ data, error: null });

describe('createStorageDrainStore', () => {
  it('claims with the instant and the limit and maps the rows', async () => {
    const rpc = jest.fn(ok([{ queue_id: 'q1', bucket: 'athlete-photos', path: 'a/b.jpg' }]));
    expect(await createStorageDrainStore(rpc).claim(NOW, 50)).toEqual([{ queueId: 'q1', bucket: 'athlete-photos', path: 'a/b.jpg' }]);
    expect(rpc).toHaveBeenCalledWith('claim_storage_deletions', { p_now: NOW.toISOString(), p_limit: 50 });
  });

  it('finishes, fails and lists orphans with the arguments of the database functions', async () => {
    const rpc = jest.fn(async (fn: string) => ({ data: fn === 'list_orphan_photo_objects' ? [{ bucket: 'athlete-photos', path: 'a/c.jpg' }] : { status: 'ok' }, error: null }));
    const store = createStorageDrainStore(rpc);
    await store.finish('q1');
    await store.fail('q2', NOW);
    expect(await store.listOrphans(NOW, 24, 200)).toEqual([{ bucket: 'athlete-photos', path: 'a/c.jpg' }]);
    expect(rpc.mock.calls).toEqual([
      ['finish_storage_deletion', { p_id: 'q1' }],
      ['fail_storage_deletion', { p_id: 'q2', p_now: NOW.toISOString() }],
      ['list_orphan_photo_objects', { p_now: NOW.toISOString(), p_grace_hours: 24, p_limit: 200 }],
    ]);
  });

  it('throws only the function name and the Postgres code when a call fails', async () => {
    const store = createStorageDrainStore(async () => ({ data: null, error: { code: '57014', message: 'secret path a/b.jpg' } }));
    await expect(store.claim(NOW, 1)).rejects.toThrow(new Error('Calling claim_storage_deletions failed (57014)'));
  });

  it('refuses malformed answers', async () => {
    await expect(createStorageDrainStore(ok({})).claim(NOW, 1)).rejects.toThrow('claim_storage_deletions failed (malformed)');
    await expect(createStorageDrainStore(ok([{ queue_id: 'q', bucket: 'b' }])).claim(NOW, 1)).rejects.toThrow('(malformed)');
    await expect(createStorageDrainStore(ok({ status: 'no' })).finish('q')).rejects.toThrow('finish_storage_deletion failed (malformed)');
    await expect(createStorageDrainStore(ok([{ bucket: 'b' }])).listOrphans(NOW, 24, 1)).rejects.toThrow('list_orphan_photo_objects failed (malformed)');
  });
});

describe('createStorageApi', () => {
  it('removes one object of one bucket', async () => {
    const remove = jest.fn(async () => ({ error: null }));
    await createStorageApi(remove).remove('athlete-photos', 'a/b.jpg');
    expect(remove).toHaveBeenCalledWith('athlete-photos', ['a/b.jpg']);
  });

  it('counts a 404 as deleted', async () => {
    await expect(createStorageApi(async () => ({ error: { status: 404 } })).remove('b', 'p')).resolves.toBeUndefined();
  });

  it('fails with the HTTP status only', async () => {
    await expect(createStorageApi(async () => ({ error: { status: 503, message: 'a/b.jpg' } })).remove('b', 'a/b.jpg')).rejects.toThrow(new Error('Storage delete failed (HTTP 503)'));
  });

  it('fails as a network error when there is no status or the call throws', async () => {
    await expect(createStorageApi(async () => ({ error: { status: undefined } })).remove('b', 'p')).rejects.toThrow(new Error('Storage delete failed (network)'));
    await expect(
      createStorageApi(async () => {
        throw new Error('a/b.jpg');
      }).remove('b', 'a/b.jpg'),
    ).rejects.toThrow(new Error('Storage delete failed (network)'));
  });
});
