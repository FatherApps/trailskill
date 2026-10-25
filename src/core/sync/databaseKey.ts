// Pure decision logic for the encrypted local database. The native pieces (SecureStore, random
// bytes, file access) are injected so Jest can test it; db.ts wires the real ones.

export const ENCRYPTED_DB_FILENAME = 'trailskill-encrypted.db';
// The first versions stored the same data unencrypted under this name.
export const LEGACY_DB_FILENAME = 'trailskill.db';

export type DatabaseKeyDeps = {
  readKey: () => string | null;
  writeKey: (key: string) => void;
  randomBytes: (byteCount: number) => Uint8Array;
  fileExists: (fileName: string) => boolean;
  deleteFile: (fileName: string) => void;
  logError: (message: string) => void;
};

function deleteDatabaseFiles(deps: DatabaseKeyDeps, dbFilename: string): void {
  // The -wal and -shm side files hold copies of recent pages, so they go too.
  for (const fileName of [`${dbFilename}-wal`, `${dbFilename}-shm`, dbFilename]) {
    if (deps.fileExists(fileName)) deps.deleteFile(fileName);
  }
}

/** Returns the SQLCipher key (64 hex chars), creating it when missing. Never logs the key. */
export function prepareEncryptedDatabase(deps: DatabaseKeyDeps): string {
  // Personal data must not stay in plaintext on the phone.
  deleteDatabaseFiles(deps, LEGACY_DB_FILENAME);

  const stored = deps.readKey();
  if (stored) return stored;

  // A file encrypted with a lost key can never be read again, so it is recreated.
  if (deps.fileExists(ENCRYPTED_DB_FILENAME)) {
    deps.logError('Local database key was missing; the encrypted local database was recreated.');
    deleteDatabaseFiles(deps, ENCRYPTED_DB_FILENAME);
  }
  const key = Array.from(deps.randomBytes(32), (byte) => byte.toString(16).padStart(2, '0')).join('');
  deps.writeKey(key);
  return key;
}
