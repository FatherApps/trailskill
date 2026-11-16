import { createConsoleLogger, LogLevels } from '@powersync/react-native';

import { isPermanentUploadError } from './connector';

type LogEntry = { level: number; message: string; error?: unknown };

// PowerSync logs a failed WebSocket connection at error level and then logs the same error object again as 'Sync error'
// while it retries. In development LogBox turns every console.error into a red overlay, and a deploy restarts PowerSync.
// shortcut: the message is the SDK's own text, so an SDK upgrade that rewords it falls back to error; re-check it on upgrade.
const CONNECTION_FAILURE = 'Failed to connect WebSocket';

/** Same console logger as before; only a connection failure the client retries is logged as a warning, anything else keeps its level. */
export function createSyncLogger(options: { minLevel: number }) {
  const logger = createConsoleLogger(options);
  const connectionFailures = new WeakSet<object>();

  return {
    ...logger,
    log(entry: LogEntry) {
      const { error } = entry;
      if (entry.level >= LogLevels.error && typeof error === 'object' && error !== null && !isPermanentUploadError(error)) {
        if (entry.message === CONNECTION_FAILURE) connectionFailures.add(error);
        if (connectionFailures.has(error)) return logger.log({ ...entry, level: LogLevels.warn });
      }
      logger.log(entry);
    },
  };
}
