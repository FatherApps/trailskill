import { open } from '@op-engineering/op-sqlite';
import { createConsoleLogger, LogLevels, PowerSyncDatabase, SyncStreamConnectionMethod, type SyncOptions } from '@powersync/react-native';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { ENCRYPTED_DB_FILENAME, prepareEncryptedDatabase } from './databaseKey';
import { AppSchema } from './schema';

// SecureStore keys allow only letters, digits, ".", "-" and "_".
const DATABASE_KEY_NAME = 'trailskill.local-database-key';

// Opening with failOnCreate throws when the file is missing and never reads it, so no key is needed.
function fileExists(name: string): boolean {
  try {
    open({ name, failOnCreate: true }).close();
    return true;
  } catch {
    return false;
  }
}

const encryptionKey = prepareEncryptedDatabase({
  readKey: () => SecureStore.getItem(DATABASE_KEY_NAME),
  writeKey: (key) => SecureStore.setItem(DATABASE_KEY_NAME, key),
  randomBytes: getRandomBytes,
  fileExists,
  deleteFile: (name) => open({ name, failOnCreate: true }).delete(),
  logError: (message) => console.error(message),
});

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: ENCRYPTED_DB_FILENAME, sqliteOptions: { encryptionKey } },
  // Debug lines in development show why a downloaded checkpoint is not applied; sync errors are logged at every level.
  logger: createConsoleLogger({ minLevel: __DEV__ ? LogLevels.debug : LogLevels.info }),
});

// Debug builds get a network inspector (added by expo-dev-launcher) that reads up to 1 MB of every HTTP response before
// handing it over. The sync stream comes over HTTP/2, never chunked, so it reached PowerSync only when the server closed it,
// and the downloaded checkpoint was never applied (#335). Development builds sync over a WebSocket; release builds keep HTTP.
export const connectOptions: SyncOptions = {
  connectionMethod: __DEV__ ? SyncStreamConnectionMethod.WEB_SOCKET : SyncStreamConnectionMethod.HTTP,
};
