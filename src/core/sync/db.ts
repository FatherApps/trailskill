import { open } from '@op-engineering/op-sqlite';
import { PowerSyncDatabase } from '@powersync/react-native';
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
});
