import {
  createAthletePhotoService,
  createInMemoryLocalPhotoFiles,
  createInMemoryPhotoCache,
  createInMemoryPhotoObjects,
  createInMemoryPhotoRows,
  createInMemoryPhotoUploadQueue,
  PhotoRejectedError,
} from '..';

jest.mock('../../../core/sync', () => ({ supabase: {}, db: {}, useQuery: jest.fn(), writeRecord: jest.fn(), deleteRecord: jest.fn() }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: '', document: '' } }));

// Synthetic data only. Every port is a fake that writes its calls into one shared log, so a test can read the ORDER of the effects:
// the contract of issue 1222 is "the object first, then the row" on the way up and "the object first, then the row" on the way out.
const A1 = 'a1111111-1111-4111-8111-111111111111';
const U1 = 'u1111111-1111-4111-8111-111111111111';
const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';
const ID_3 = '33333333-3333-4333-8333-333333333333';

function setup(ids = [ID_1, ID_2, ID_3]) {
  const log: string[] = [];
  const queue = createInMemoryPhotoUploadQueue();
  const objects = createInMemoryPhotoObjects(log);
  const rows = createInMemoryPhotoRows(log);
  const files = createInMemoryLocalPhotoFiles(log);
  const next = [...ids];
  const photoCache = createInMemoryPhotoCache();
  // The cache takes the file by moving it, so it leaves the kept folder without being deleted.
  const cache = {
    adopt: (photo: { athleteId: string; storagePath: string }, uri: string) => {
      log.push(`adopt ${photo.storagePath}`);
      photoCache.adopt(photo, uri);
      files.moveOut(uri);
    },
  };
  const service = createAthletePhotoService({ queue, objects, rows, files, cache, newId: () => next.shift() as string });
  return { log, queue, objects, rows, files, photoCache, service };
}

describe('athlete photo service', () => {
  it('keeps the image on the device, uploads the object and only then writes the row', async () => {
    const { log, queue, rows, files, service } = setup();

    await service.add(A1, 'file:///picked.jpg', U1);

    expect(log).toEqual([`keep ${A1} ${ID_1}`, `upload ${A1}/${ID_1}.jpg`, `row-save ${A1}/${ID_1}.jpg`, `adopt ${A1}/${ID_1}.jpg`]);
    expect(rows.stored(A1)?.storagePath).toBe(`${A1}/${ID_1}.jpg`);
    expect(await queue.list()).toEqual([]);
    expect(files.kept()).toEqual([]);
  });

  it('after the row is written the image moves into the photo cache, so it keeps showing before the server can sign it', async () => {
    const { photoCache, files, service } = setup();

    await service.add(A1, 'file:///picked.jpg', U1);

    expect(photoCache.get({ athleteId: A1, storagePath: `${A1}/${ID_1}.jpg` })).toBe(`file:///kept/${A1}/${ID_1}.jpg`);
    expect(files.kept()).toEqual([]);
  });

  it('a 401 or 403 is not a reason to drop the photo: it stays queued for the next try', async () => {
    const { objects, queue, files, service } = setup();
    objects.failUploads(new Error('An athlete photo could not be uploaded'));

    await service.add(A1, 'file:///picked.jpg', U1);

    expect(await queue.list()).toHaveLength(1);
    expect(files.kept()).toEqual([`${A1}/${ID_1}`]);
  });

  it('offline: the photo waits in the queue with its local file and nothing is written', async () => {
    const { log, objects, queue, rows, files, service } = setup();
    objects.failUploads(new Error('Network request failed'));

    await service.add(A1, 'file:///picked.jpg', U1);

    expect(log).not.toContain(`row-save ${A1}/${ID_1}.jpg`);
    expect(rows.stored(A1)).toBeNull();
    expect(await queue.list(A1)).toEqual([{ id: ID_1, athleteId: A1, localUri: `file:///kept/${A1}/${ID_1}.jpg` }]);
    expect(files.kept()).toEqual([`${A1}/${ID_1}`]);
  });

  it('when the connection comes back it uploads the object and then writes the row, once', async () => {
    const { log, objects, queue, service } = setup();
    objects.failUploads(new Error('Network request failed'));
    await service.add(A1, 'file:///picked.jpg', U1);
    log.length = 0;
    objects.failUploads(null);

    await service.drain(U1);
    await service.drain(U1);

    expect(log).toEqual([`upload ${A1}/${ID_1}.jpg`, `row-save ${A1}/${ID_1}.jpg`, `adopt ${A1}/${ID_1}.jpg`]);
    expect(await queue.list()).toEqual([]);
  });

  it('two drains at the same time upload once', async () => {
    const { log, objects, service } = setup();
    objects.failUploads(new Error('Network request failed'));
    await service.add(A1, 'file:///picked.jpg', U1);
    log.length = 0;
    objects.failUploads(null);

    await Promise.all([service.drain(U1), service.drain(U1)]);

    expect(log.filter((line) => line.startsWith('upload'))).toHaveLength(1);
  });

  it('a row that failed to save after the object went up is retried with the same object path', async () => {
    const { log, rows, queue, service } = setup();
    rows.failSaves(new Error('disk full'));

    await service.add(A1, 'file:///picked.jpg', U1);
    expect(await queue.list()).toHaveLength(1);
    rows.failSaves(null);
    await service.drain(U1);

    expect(log.filter((line) => line.startsWith('upload'))).toEqual([`upload ${A1}/${ID_1}.jpg`, `upload ${A1}/${ID_1}.jpg`]);
    expect(rows.stored(A1)?.storagePath).toBe(`${A1}/${ID_1}.jpg`);
    expect(await queue.list()).toEqual([]);
  });

  it('changing the photo uploads an object with a new path and points the same row at it', async () => {
    const { rows, service } = setup();
    await service.add(A1, 'file:///one.jpg', U1);
    const first = rows.stored(A1);

    await service.add(A1, 'file:///two.jpg', U1);

    expect(rows.stored(A1)?.id).toBe(first?.id);
    expect(rows.stored(A1)?.storagePath).toBe(`${A1}/${ID_2}.jpg`);
    expect(rows.stored(A1)?.storagePath).not.toBe(first?.storagePath);
  });

  it('choosing another photo while one is still queued replaces it and deletes its local file', async () => {
    const { objects, queue, files, service } = setup();
    objects.failUploads(new Error('Network request failed'));
    await service.add(A1, 'file:///one.jpg', U1);

    await service.add(A1, 'file:///two.jpg', U1);

    expect(await queue.list(A1)).toEqual([{ id: ID_2, athleteId: A1, localUri: `file:///kept/${A1}/${ID_2}.jpg` }]);
    expect(files.kept()).toEqual([`${A1}/${ID_2}`]);
  });

  it('a photo the server refuses for good is dropped with its file instead of retried forever', async () => {
    const { objects, queue, files, rows, service } = setup();
    objects.failUploads(new PhotoRejectedError());

    await service.add(A1, 'file:///picked.jpg', U1);

    expect(await queue.list()).toEqual([]);
    expect(files.kept()).toEqual([]);
    expect(rows.stored(A1)).toBeNull();
  });

  it('one failing athlete does not block the next in the queue', async () => {
    const { log, objects, queue, service } = setup();
    const A2 = 'a2222222-2222-4222-8222-222222222222';
    objects.failUploads(new Error('Network request failed'));
    await service.add(A1, 'file:///one.jpg', U1);
    await service.add(A2, 'file:///two.jpg', U1);
    log.length = 0;
    objects.failUploads(null);

    await service.drain(U1);

    expect(log.filter((line) => line.startsWith('row-save'))).toEqual([`row-save ${A1}/${ID_1}.jpg`, `row-save ${A2}/${ID_2}.jpg`]);
    expect(await queue.list()).toEqual([]);
  });

  describe('removing the photo', () => {
    it('deletes the object first and the row after it', async () => {
      const { log, rows, service } = setup();
      await service.add(A1, 'file:///picked.jpg', U1);
      log.length = 0;

      await service.remove(A1);

      expect(log).toEqual([`object-remove ${A1}/${ID_1}.jpg`, `row-remove ${A1}/${ID_1}.jpg`]);
      expect(rows.stored(A1)).toBeNull();
    });

    it('keeps the row when the object could not be deleted, so nothing is left pointing nowhere', async () => {
      const { objects, rows, service } = setup();
      await service.add(A1, 'file:///picked.jpg', U1);
      objects.failRemovals(new Error('Network request failed'));

      await expect(service.remove(A1)).rejects.toThrow('Network request failed');

      expect(rows.stored(A1)).not.toBeNull();
    });

    it('also drops a photo that is still queued', async () => {
      const { objects, queue, files, service } = setup();
      objects.failUploads(new Error('Network request failed'));
      await service.add(A1, 'file:///picked.jpg', U1);

      await service.remove(A1);

      expect(await queue.list()).toEqual([]);
      expect(files.kept()).toEqual([]);
    });

    it('removes the row it found earlier even after the device lost it, so the object never stays behind', async () => {
      const { log, rows, service } = setup();
      await service.add(A1, 'file:///picked.jpg', U1);
      const found = await service.find(A1);
      await rows.remove(found!.id);
      log.length = 0;

      await service.remove(A1, found);

      expect(log).toEqual([`object-remove ${A1}/${ID_1}.jpg`]);
    });

    it('says whether the athlete has a photo, stored or still waiting', async () => {
      const { objects, service } = setup();
      expect(await service.has(A1)).toBe(false);
      objects.failUploads(new Error('Network request failed'));
      await service.add(A1, 'file:///picked.jpg', U1);
      expect(await service.has(A1)).toBe(true);
      objects.failUploads(null);
      await service.drain(U1);
      expect(await service.has(A1)).toBe(true);
      await service.remove(A1);
      expect(await service.has(A1)).toBe(false);
    });

    it('with no photo it does nothing', async () => {
      const { log, service } = setup();

      await service.remove(A1);

      expect(log).toEqual([]);
    });
  });

  it('discardAll drops every queued photo and every kept image, even one no queue row names', async () => {
    const { log, objects, queue, files, service } = setup();
    objects.failUploads(new Error('Network request failed'));
    await service.add(A1, 'file:///one.jpg', U1);

    await service.discardAll();

    expect(await queue.list()).toEqual([]);
    expect(files.kept()).toEqual([]);
    expect(log).toContain('clear-files');
  });

  it('discard drops the queued photo of one athlete and leaves the others', async () => {
    const { objects, queue, files, service } = setup();
    const A2 = 'a2222222-2222-4222-8222-222222222222';
    objects.failUploads(new Error('Network request failed'));
    await service.add(A1, 'file:///one.jpg', U1);
    await service.add(A2, 'file:///two.jpg', U1);

    await service.discard(A1);

    expect(await queue.list()).toEqual([{ id: ID_2, athleteId: A2, localUri: `file:///kept/${A2}/${ID_2}.jpg` }]);
    expect(files.kept()).toEqual([`${A2}/${ID_2}`]);
  });
});
