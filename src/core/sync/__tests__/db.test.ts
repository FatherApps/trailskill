// @powersync/react-native ships ESM only and the SQLite and Expo modules are native, so db.ts is loaded with fakes.
jest.mock('@powersync/react-native', () => ({
  PowerSyncDatabase: jest.fn(),
  SyncStreamConnectionMethod: { HTTP: 'http', WEB_SOCKET: 'web-socket' },
  LogLevels: { trace: 10, debug: 20, info: 30, warn: 40, error: 50 },
  createConsoleLogger: (options: unknown) => options,
}));
jest.mock('@op-engineering/op-sqlite', () => ({ open: jest.fn() }));
jest.mock('expo-crypto', () => ({ getRandomBytes: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('../databaseKey', () => ({ ENCRYPTED_DB_FILENAME: 'test.db', prepareEncryptedDatabase: () => 'key' }));
jest.mock('../schema', () => ({ AppSchema: {} }));

type DbModule = typeof import('../db');

function loadDb(dev: boolean): DbModule {
  const previous = (global as { __DEV__?: boolean }).__DEV__;
  (global as { __DEV__?: boolean }).__DEV__ = dev;
  try {
    let loaded: DbModule | undefined;
    jest.isolateModules(() => {
      loaded = jest.requireActual<DbModule>('../db');
    });
    return loaded!;
  } finally {
    (global as { __DEV__?: boolean }).__DEV__ = previous;
  }
}

describe('connectOptions', () => {
  // Debug builds read the start of every HTTP response before handing it over, so the HTTP sync stream never arrives (#335).
  it('syncs over a WebSocket in development builds', () => {
    expect(loadDb(true).connectOptions).toEqual({ connectionMethod: 'web-socket', params: { expired_saved_share_codes: 1 } });
  });

  // The stream of expired saved share codes checks `= 1`, so the value is the number 1, never true (#1321).
  it('asks for the expired saved share codes, with the number 1', () => {
    expect(loadDb(false).connectOptions.params).toEqual({ expired_saved_share_codes: 1 });
  });

  it('keeps HTTP streaming in release builds', () => {
    expect(loadDb(false).connectOptions).toEqual({ connectionMethod: 'http', params: { expired_saved_share_codes: 1 } });
  });
});
