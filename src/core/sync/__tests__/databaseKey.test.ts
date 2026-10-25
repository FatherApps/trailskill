import { prepareEncryptedDatabase, type DatabaseKeyDeps } from '../databaseKey';

const ENCRYPTED = 'trailskill-encrypted.db';
const LEGACY = 'trailskill.db';
const family = (name: string) => [name + '-wal', name + '-shm', name];

function setup(opts: { storedKey?: string | null; existing?: string[] } = {}) {
  const files = new Set(opts.existing ?? []);
  const deleted: string[] = [];
  const written: string[] = [];
  const logged: string[] = [];
  const deps: DatabaseKeyDeps = {
    readKey: () => opts.storedKey ?? null,
    writeKey: (key) => written.push(key),
    randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => i + 0xa0),
    fileExists: (name) => files.has(name),
    deleteFile: (name) => {
      files.delete(name);
      deleted.push(name);
    },
    logError: (message) => logged.push(message),
  };
  return { deps, deleted, written, logged };
}

describe('prepareEncryptedDatabase', () => {
  it('returns an existing key as is, drops the legacy database and keeps the encrypted one', () => {
    const { deps, deleted, written, logged } = setup({
      storedKey: 'ab'.repeat(32),
      existing: [...family(LEGACY), ...family(ENCRYPTED)],
    });

    expect(prepareEncryptedDatabase(deps)).toBe('ab'.repeat(32));

    expect(written).toEqual([]);
    expect(deleted).toEqual(family(LEGACY));
    expect(logged).toEqual([]);
  });

  it('creates a 64-hex key from 32 bytes on a normal first run and logs nothing', () => {
    const { deps, deleted, written, logged } = setup({ existing: family(LEGACY) });

    const key = prepareEncryptedDatabase(deps);

    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(Array.from({ length: 32 }, (_, i) => (i + 0xa0).toString(16)).join(''));
    expect(written).toEqual([key]);
    expect(deleted).toEqual(family(LEGACY));
    expect(logged).toEqual([]);
  });

  it('deletes only the files that exist', () => {
    const { deps, deleted } = setup({ storedKey: 'ab'.repeat(32), existing: [LEGACY] });

    prepareEncryptedDatabase(deps);

    expect(deleted).toEqual([LEGACY]);
  });

  it('on a first run with nothing on disk deletes nothing and logs nothing', () => {
    const { deps, deleted, logged } = setup();

    prepareEncryptedDatabase(deps);

    expect(deleted).toEqual([]);
    expect(logged).toEqual([]);
  });

  it('recreates the encrypted database when its key is lost and logs one error without the key', () => {
    const { deps, deleted, written, logged } = setup({ existing: family(ENCRYPTED) });

    const key = prepareEncryptedDatabase(deps);

    expect(written).toEqual([key]);
    expect(deleted).toEqual(family(ENCRYPTED));
    expect(logged).toHaveLength(1);
    expect(logged[0]).not.toContain(key);
  });

  it('deletes the old encrypted file before the new key is stored', () => {
    const order: string[] = [];
    const { deps } = setup({ existing: family(ENCRYPTED) });
    prepareEncryptedDatabase({
      ...deps,
      deleteFile: (name) => order.push(`delete:${name}`),
      writeKey: () => order.push('write'),
    });

    expect(order).toEqual([...family(ENCRYPTED).map((n) => `delete:${n}`), 'write']);
  });

  it('never passes the key to logError', () => {
    for (const opts of [
      { storedKey: 'cd'.repeat(32), existing: [...family(LEGACY), ...family(ENCRYPTED)] },
      { existing: family(LEGACY) },
      { existing: family(ENCRYPTED) },
    ]) {
      const { deps, logged } = setup(opts);
      const key = prepareEncryptedDatabase(deps);
      expect(logged.join(' ')).not.toContain(key);
    }
  });
});
