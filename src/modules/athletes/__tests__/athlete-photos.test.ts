import { createFileSystemPhotoCache, createInMemoryAthletePhotoRepository, createInMemoryPhotoCache, createSupabaseAthletePhotoRepository } from '..';

// A small in-memory file system behind the expo-file-system classes the cache uses (synthetic data only).
const mockTree = new Map<string, string | null>(); // path -> file content, null for a directory
const mockDownload = jest.fn(async (_url: string, destination: { uri: string }) => {
  mockTree.set(destination.uri, 'image');
  return destination;
});
const mockSign = jest.fn();

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) => parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  const prefix = (uri: string) => `${uri}/`;
  class Entry {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.split('/').pop() as string;
    }
    get exists() {
      return mockTree.has(this.uri);
    }
    delete() {
      for (const path of [...mockTree.keys()]) if (path === this.uri || path.startsWith(prefix(this.uri))) mockTree.delete(path);
    }
  }
  class File extends Entry {
    static downloadFileAsync = (url: string, destination: File) => mockDownload(url, destination);
  }
  class Directory extends Entry {
    create() {
      // Like { intermediates: true }: every folder on the way exists too.
      const parts = this.uri.slice('file:///cache/'.length).split('/');
      parts.forEach((_part, index) => mockTree.set(`file:///cache/${parts.slice(0, index + 1).join('/')}`, null));
    }
    list() {
      const children = new Map<string, boolean>();
      for (const [path, content] of mockTree) {
        if (!path.startsWith(prefix(this.uri))) continue;
        const [first, ...rest] = path.slice(prefix(this.uri).length).split('/');
        children.set(first, rest.length > 0 || content === null);
      }
      return [...children].map(([name, isDirectory]) => (isDirectory ? new Directory(this.uri, name) : new File(this.uri, name)));
    }
  }
  return { Directory, File, Paths: { cache: new Directory('file:///cache') } };
});
jest.mock('../../../core/sync', () => ({
  supabase: { storage: { from: (bucket: string) => ({ createSignedUrl: (...args: unknown[]) => mockSign(bucket, ...args) }) } },
}));

const A1 = 'a1';
const PATH_A = 'a1/11111111-1111-4111-8111-111111111111.jpg';
const PATH_B = 'a1/22222222-2222-4222-8222-222222222222.jpg';
const PATH_C = 'a2/33333333-3333-4333-8333-333333333333.jpg';

beforeEach(() => {
  mockTree.clear();
  mockDownload.mockClear();
  mockSign.mockReset();
});

describe('createSupabaseAthletePhotoRepository', () => {
  it('asks the private bucket for a signed URL of about 5 minutes', async () => {
    mockSign.mockResolvedValue({ data: { signedUrl: 'https://signed.example.test/x' }, error: null });

    await expect(createSupabaseAthletePhotoRepository().createSignedUrl(PATH_A)).resolves.toBe('https://signed.example.test/x');
    expect(mockSign).toHaveBeenCalledWith('athlete-photos', PATH_A, 300);
  });

  it('fails without the path in the message when the server refuses', async () => {
    mockSign.mockResolvedValue({ data: null, error: { message: `Object not found: ${PATH_A}` } });

    const failure = createSupabaseAthletePhotoRepository().createSignedUrl(PATH_A);
    await expect(failure).rejects.toThrow('Could not get a signed URL for an athlete photo');
    await expect(failure).rejects.not.toThrow(PATH_A);
  });
});

describe('createInMemoryAthletePhotoRepository', () => {
  it('answers only for the paths it was given and records what was asked', async () => {
    const photos = createInMemoryAthletePhotoRepository({ [PATH_A]: 'https://signed.example.test/a' });

    await expect(photos.createSignedUrl(PATH_A)).resolves.toBe('https://signed.example.test/a');
    await expect(photos.createSignedUrl(PATH_C)).rejects.toThrow('Could not get a signed URL');
    expect(photos.requested).toEqual([PATH_A, PATH_C]);
  });
});

describe('createFileSystemPhotoCache', () => {
  const cache = createFileSystemPhotoCache();

  it('downloads into cacheDirectory/athlete-photos/<athlete id>/ and finds that exact photo again', async () => {
    expect(cache.get({ athleteId: A1, storagePath: PATH_A })).toBeNull();

    const uri = await cache.put({ athleteId: A1, storagePath: PATH_A }, 'https://signed.example.test/a');

    expect(uri).toBe('file:///cache/athlete-photos/a1/11111111-1111-4111-8111-111111111111.jpg');
    expect(mockDownload).toHaveBeenCalledWith('https://signed.example.test/a', expect.objectContaining({ uri }));
    expect(cache.get({ athleteId: A1, storagePath: PATH_A })).toBe(uri);
    expect(cache.get({ athleteId: A1, storagePath: PATH_B })).toBeNull();
  });

  it('keeps one photo per athlete: a new path replaces the old file', async () => {
    await cache.put({ athleteId: A1, storagePath: PATH_A }, 'u1');
    await cache.put({ athleteId: A1, storagePath: PATH_B }, 'u2');

    expect(cache.get({ athleteId: A1, storagePath: PATH_A })).toBeNull();
    expect(cache.get({ athleteId: A1, storagePath: PATH_B })).not.toBeNull();
  });

  it('leaves nothing behind when the download fails', async () => {
    mockDownload.mockRejectedValueOnce(new Error('network'));

    await expect(cache.put({ athleteId: A1, storagePath: PATH_A }, 'u1')).rejects.toThrow('network');
    expect(cache.get({ athleteId: A1, storagePath: PATH_A })).toBeNull();
    expect([...mockTree.keys()].filter((path) => path.includes('athlete-photos/a1'))).toEqual([]);
  });

  it('clears one athlete or everything', async () => {
    await cache.put({ athleteId: A1, storagePath: PATH_A }, 'u1');
    await cache.put({ athleteId: 'a2', storagePath: PATH_C }, 'u3');

    cache.clearAthlete(A1);
    expect(cache.get({ athleteId: A1, storagePath: PATH_A })).toBeNull();
    expect(cache.get({ athleteId: 'a2', storagePath: PATH_C })).not.toBeNull();

    cache.clearAll();
    expect(cache.get({ athleteId: 'a2', storagePath: PATH_C })).toBeNull();
    expect([...mockTree.keys()].filter((path) => path.includes('athlete-photos'))).toEqual([]);
  });

  it('prunes what the rows no longer justify and keeps what they do', async () => {
    await cache.put({ athleteId: A1, storagePath: PATH_A }, 'u1');
    await cache.put({ athleteId: 'a2', storagePath: PATH_C }, 'u3');

    cache.prune([{ athleteId: 'a2', storagePath: PATH_C }]);

    expect(cache.get({ athleteId: A1, storagePath: PATH_A })).toBeNull();
    expect(cache.get({ athleteId: 'a2', storagePath: PATH_C })).not.toBeNull();
    cache.prune([]);
    expect(cache.get({ athleteId: 'a2', storagePath: PATH_C })).toBeNull();
  });

  it.each([
    ['an athlete id with a path separator', '../a1', PATH_A],
    ['a file name that is not a jpg', A1, 'a1/passwd'],
    ['a file name that climbs out', A1, 'a1/../../x.jpg'],
  ])('refuses %s', async (_name, athleteId, storagePath) => {
    expect(() => cache.get({ athleteId, storagePath })).toThrow('Invalid athlete photo reference');
    await expect(cache.put({ athleteId, storagePath }, 'u1')).rejects.toThrow('Invalid athlete photo reference');
    expect(mockDownload).not.toHaveBeenCalled();
  });
});

describe('createInMemoryPhotoCache', () => {
  it('has the same contract: one photo per athlete, clear and prune', async () => {
    const cache = createInMemoryPhotoCache();
    await cache.put({ athleteId: A1, storagePath: PATH_A }, 'u1');
    await cache.put({ athleteId: A1, storagePath: PATH_B }, 'u2');
    await cache.put({ athleteId: 'a2', storagePath: PATH_C }, 'u3');
    expect(cache.files()).toEqual(['a1/22222222-2222-4222-8222-222222222222.jpg', 'a2/33333333-3333-4333-8333-333333333333.jpg']);

    cache.prune([{ athleteId: 'a2', storagePath: PATH_C }]);
    expect(cache.files()).toEqual(['a2/33333333-3333-4333-8333-333333333333.jpg']);
    cache.clearAll();
    expect(cache.files()).toEqual([]);
  });
});
