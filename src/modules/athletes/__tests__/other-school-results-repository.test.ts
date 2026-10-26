import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AppSchema } from '../../../core/sync/schema';
import { createInMemoryOtherSchoolResultsRepository, createSupabaseOtherSchoolResultsRepository } from '../data/otherSchoolResults';

// @powersync/react-native ships ESM only and Jest cannot load it, so the schema builders are faked (as in the sync schema test).
jest.mock('@powersync/react-native', () => ({
  column: { text: 'TEXT', integer: 'INTEGER' },
  Table: class {},
  Schema: class {
    tables: { name: string }[];
    constructor(tables: Record<string, unknown>) {
      this.tables = Object.keys(tables).map((name) => ({ name }));
    }
  },
}));

// A database whose every method fails the test: the repository must never reach the local database.
const mockDbCalls = jest.fn();
jest.mock('../../../core/sync', () => ({
  supabase: {},
  db: new Proxy({}, { get: () => (...args: unknown[]) => mockDbCalls(...args) }),
}));

const event = { stroke: 'FR', distance: '50m', pool: 'SCM' } as const;
const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  kind: 'race',
  hundredths: 3482,
  stroke: 'FR',
  distance: '50m',
  pool: 'SCM',
  session_type: 'competition',
  captured_at: '2026-10-18T10:00:00.000Z',
  arrival_position: null,
  ...over,
});
const clientReturning = (data: unknown, error: Error | null = null) => ({ rpc: jest.fn().mockResolvedValue({ data, error }) });

describe('other school results repository', () => {
  beforeEach(() => mockDbCalls.mockClear());

  it('asks the server for the athlete and keeps the rows of the event, mapped to camel case', async () => {
    const client = clientReturning([row(), row({ id: 'r2', stroke: 'BK' }), row({ id: 'r3', pool: 'LCM' })]);

    const results = await createSupabaseOtherSchoolResultsRepository(client).listByEvent('a1', event);

    expect(client.rpc).toHaveBeenCalledWith('other_school_results', { athlete: 'a1' });
    expect(results).toEqual([
      { id: 'r1', kind: 'race', hundredths: 3482, stroke: 'FR', distance: '50m', pool: 'SCM', sessionType: 'competition', capturedAt: '2026-10-18T10:00:00.000Z', arrivalPosition: null },
    ]);
  });

  it('normalises the PostgREST timestamp to the ISO form local rows use', async () => {
    const client = clientReturning([row({ captured_at: '2026-10-05T08:00:00+00:00' })]);

    const [result] = await createSupabaseOtherSchoolResultsRepository(client).listByEvent('a1', event);

    expect(result!.capturedAt).toBe('2026-10-05T08:00:00.000Z');
  });

  it('rejects when the server fails', async () => {
    const client = clientReturning(null, new Error('offline'));

    await expect(createSupabaseOtherSchoolResultsRepository(client).listByEvent('a1', event)).rejects.toThrow('offline');
  });

  it('shows no birth date, document, author or device even if the server sent them', async () => {
    const client = clientReturning([row({ birth_date: '2012-01-01', document: '123', created_by: 'x', device_id: 'y' })]);

    const [result] = await createSupabaseOtherSchoolResultsRepository(client).listByEvent('a1', event);

    expect(Object.keys(result!).sort()).toEqual(
      ['arrivalPosition', 'capturedAt', 'distance', 'hundredths', 'id', 'kind', 'pool', 'sessionType', 'stroke'],
    );
  });

  it('never touches the local database, and no table of another school is synced', async () => {
    await createSupabaseOtherSchoolResultsRepository(clientReturning([row()])).listByEvent('a1', event);

    expect(mockDbCalls).not.toHaveBeenCalled();
    expect(AppSchema.tables.map((table) => table.name).filter((name) => /other_school/.test(name))).toEqual([]);
    expect(readFileSync(join(__dirname, '../../../../powersync/sync-config.yaml'), 'utf8')).not.toMatch(/other_school/);
  });

  it('serves the in-memory fake by athlete and event', async () => {
    const { id, kind, hundredths, stroke, distance, pool, sessionType, capturedAt, arrivalPosition } = {
      id: 'r1', kind: 'race', hundredths: 3482, stroke: 'FR', distance: '50m', pool: 'SCM', sessionType: 'competition', capturedAt: '2026-10-18T10:00:00.000Z', arrivalPosition: null,
    } as const;
    const fake = createInMemoryOtherSchoolResultsRepository([
      { athleteId: 'a1', id, kind, hundredths, stroke, distance, pool, sessionType, capturedAt, arrivalPosition },
      { athleteId: 'a2', id: 'r2', kind, hundredths, stroke, distance, pool, sessionType, capturedAt, arrivalPosition },
    ]);

    expect((await fake.listByEvent('a1', event)).map((r) => r.id)).toEqual(['r1']);
  });
});
