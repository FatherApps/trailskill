import { createSyncLogger } from '../syncLogger';

// @powersync/react-native ships ESM only: the logger is tested with a fake console logger that records the level it receives.
const logged: { level: number; message: string; error?: unknown }[] = [];
jest.mock('@powersync/react-native', () => ({
  LogLevels: { trace: 10, debug: 20, info: 30, warn: 40, error: 50 },
  createConsoleLogger: () => ({ log: (record: { level: number; message: string; error?: unknown }) => logged.push(record) }),
}));

const ERROR = 50;
const WARN = 40;

beforeEach(() => {
  logged.length = 0;
});

describe('createSyncLogger', () => {
  // A deploy restarts PowerSync: the client reconnects by itself, so the red LogBox overlay must not cover the app.
  it('logs a failed WebSocket connection as a warning', () => {
    createSyncLogger({ minLevel: 20 }).log({ level: ERROR, message: 'Failed to connect WebSocket', error: new Error('closed') });
    expect(logged.map((record) => record.level)).toEqual([WARN]);
  });

  it('logs the sync error that follows the same failed connection as a warning', () => {
    const logger = createSyncLogger({ minLevel: 20 });
    const failure = new Error('closed');
    logger.log({ level: ERROR, message: 'Failed to connect WebSocket', error: failure });
    logger.log({ level: ERROR, message: 'Sync error', error: failure });
    expect(logged.map((record) => record.level)).toEqual([WARN, WARN]);
  });

  it('keeps the message and the error object of a downgraded record', () => {
    const failure = new Error('closed');
    createSyncLogger({ minLevel: 20 }).log({ level: ERROR, message: 'Failed to connect WebSocket', error: failure });
    expect(logged[0]).toMatchObject({ message: 'Failed to connect WebSocket', error: failure });
  });

  it('keeps a permanent rejection as an error', () => {
    const logger = createSyncLogger({ minLevel: 20 });
    const rejection = Object.assign(new Error('violates a constraint'), { code: '23505' });
    logger.log({ level: ERROR, message: 'Failed to connect WebSocket', error: rejection });
    logger.log({ level: ERROR, message: 'Sync error', error: rejection });
    expect(logged.map((record) => record.level)).toEqual([ERROR, ERROR]);
  });

  it('keeps an unknown sync error as an error', () => {
    const logger = createSyncLogger({ minLevel: 20 });
    logger.log({ level: ERROR, message: 'Sync error', error: new Error('checkpoint rejected') });
    logger.log({ level: ERROR, message: 'Error in crud upload loop', error: new Error('boom') });
    logger.log({ level: ERROR, message: 'Sync error' });
    expect(logged.map((record) => record.level)).toEqual([ERROR, ERROR, ERROR]);
  });

  it('leaves records of other levels untouched', () => {
    const logger = createSyncLogger({ minLevel: 20 });
    logger.log({ level: 20, message: 'Failed to connect WebSocket', error: new Error('closed') });
    logger.log({ level: WARN, message: 'Sync aborted' });
    expect(logged.map((record) => record.level)).toEqual([20, WARN]);
  });
});
