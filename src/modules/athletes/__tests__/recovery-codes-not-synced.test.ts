import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..', '..', '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

// The permanent code lives only in the phone's encrypted store and the texts are shown once: none may reach a PowerSync table, a stream
// or the upload queue. The tables of the server (athlete_recovery_*) are not in any stream either (migration 20261122110000).
describe('recovery codes stay out of PowerSync', () => {
  it('has no table, column or stream about recovery codes', () => {
    expect(read('powersync', 'sync-config.yaml')).not.toMatch(/recovery/i);
    expect(read('src', 'core', 'sync', 'schema.ts')).not.toMatch(/recovery/i);
  });

  it.each(['athleteRecoveryCodes.ts', 'recoveryCodeVault.ts', 'useRecoveryCodeNotices.ts'])('%s never touches the local database or the upload queue', (file) => {
    const source = read('src', 'modules', 'athletes', 'data', file);
    // The only thing it may take from the sync layer is the server client, for the remote calls.
    const fromSync = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[./]*core\/sync[^']*'/g)].flatMap((match) => match[1]!.split(',').map((name) => name.trim()));
    expect(fromSync.filter((name) => name !== '' && name !== 'supabase')).toEqual([]);
    expect(source).not.toMatch(/writeRecord|powersync|\.execute\(/i);
  });
});
