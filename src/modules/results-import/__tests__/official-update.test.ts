import {
  createIdentityConfirmation,
  createInMemoryImportedResultsRepository,
  createOfficialUpdate,
  sortOutFound,
  updateButtonState,
  type FoundResult,
  type ImportedResult,
  type OfficialResultsService,
  type PendingResultChange,
} from '..';

// The public entry also exports the PowerSync repository, which loads the ESM-only sync stack.
jest.mock('../../../core/sync', () => ({ db: {}, supabase: {} }));

const values = { stroke: 'FR', distance: '50m', pool: 'LCM', hundredths: 2890, swumOn: '2026-03-14', competition: 'Synthetic Open' } as const;
const found = (overrides: Partial<FoundResult> = {}): FoundResult => ({ id: 'f1', ...values, ...overrides });

const imported = (overrides: Partial<ImportedResult> = {}): ImportedResult => ({
  id: 'r1',
  athleteId: 'a1',
  importId: 'i1',
  provider: 'zz-test',
  sourceResultKey: 'k1',
  revision: 1,
  supersedesId: null,
  createdAt: '2026-10-28T10:00:00Z',
  ...values,
  ...overrides,
});

const pending = (overrides: Partial<PendingResultChange & { status: 'kept_current' }> = {}): PendingResultChange & { status: 'pending' | 'kept_current' } => ({
  id: 'c1',
  importedResultId: 'r1',
  athleteId: 'a1',
  importId: 'i2',
  createdAt: '2026-10-28T11:00:00Z',
  status: 'pending',
  ...values,
  hundredths: 2850,
  ...overrides,
});

describe('sortOutFound', () => {
  it('lists a result the app does not show yet', () => {
    expect(sortOutFound([found({ swumOn: '2026-05-02' })], [imported()])).toEqual([found({ swumOn: '2026-05-02' })]);
  });

  it('drops a result with the values the app already shows', () => {
    expect(sortOutFound([found()], [imported()])).toEqual([]);
  });

  it('keeps a result whose time moved at the source: importing it records a pending change', () => {
    expect(sortOutFound([found({ hundredths: 2850 })], [imported()])).toHaveLength(1);
  });

  it('drops a result whose difference already waits for a choice', () => {
    expect(sortOutFound([found({ hundredths: 2850 })], [imported(), pending()])).toEqual([]);
  });

  it('drops a result whose change the guardian already decided, and offers it again when the source moves to another value', () => {
    const kept = pending({ status: 'kept_current' });
    expect(sortOutFound([found({ hundredths: 2850 })], [imported(), kept])).toEqual([]);
    expect(sortOutFound([found({ hundredths: 2840 })], [imported(), kept])).toHaveLength(1);
  });

  it('keeps a missing time as null, never zero', () => {
    const [item] = sortOutFound([found({ hundredths: null })], []);
    expect(item?.hundredths).toBeNull();
  });

  it('tells a missing time from a time', () => {
    expect(sortOutFound([found({ hundredths: null })], [imported()])).toHaveLength(1);
  });

  it('lists the same id once', () => {
    expect(sortOutFound([found(), found()], [])).toHaveLength(1);
  });
});

const ok = <T,>(value: T) => ({ ok: true as const, value });
const fail = (error: object) => ({ ok: false as const, error });
const summary = { importId: 'i9', inserted: 1, duplicates: 0, changes: 0 };

function service(overrides: Partial<OfficialResultsService> = {}): jest.Mocked<OfficialResultsService> {
  return {
    status: jest.fn(),
    results: jest.fn().mockResolvedValue(ok([found({ swumOn: '2026-05-02' })])),
    importChosen: jest.fn().mockResolvedValue(ok(summary)),
    ...overrides,
  } as jest.Mocked<OfficialResultsService>;
}

const setup = (svc = service(), results: ImportedResult[] = [imported()], changes: ReturnType<typeof pending>[] = []) =>
  createOfficialUpdate({ service: svc, repository: createInMemoryImportedResultsRepository(results, changes) });

describe('createOfficialUpdate.check', () => {
  it('offers the new results', async () => {
    expect(await setup().check('a1')).toEqual({ kind: 'found', results: [found({ swumOn: '2026-05-02' })] });
  });

  it('does not offer again a change the guardian kept', async () => {
    const svc = service({ results: jest.fn().mockResolvedValue(ok([found({ hundredths: 2850 })])) });
    expect(await setup(svc, [imported()], [pending({ status: 'kept_current' })]).check('a1')).toEqual({ kind: 'none' });
  });

  it('says there is nothing new when the app shows every result', async () => {
    const svc = service({ results: jest.fn().mockResolvedValue(ok([found()])) });
    expect(await setup(svc).check('a1')).toEqual({ kind: 'none' });
  });

  it('reports when the next try is allowed', async () => {
    const svc = service({ results: jest.fn().mockResolvedValue(fail({ code: 'rate_limited', retryAt: '2026-10-29T12:10:00Z' })) });
    expect(await setup(svc).check('a1')).toEqual({ kind: 'rate_limited', retryAt: '2026-10-29T12:10:00Z' });
  });

  it.each(['unavailable', 'not_authorized', 'no_provider', 'not_confirmed'])('says unavailable when the server answers %s', async (code) => {
    const svc = service({ results: jest.fn().mockResolvedValue(fail({ code })) });
    expect(await setup(svc).check('a1')).toEqual({ kind: 'unavailable' });
  });

  it('says unavailable when the request throws, as when offline', async () => {
    const svc = service({ results: jest.fn().mockRejectedValue(new Error('network')) });
    expect(await setup(svc).check('a1')).toEqual({ kind: 'unavailable' });
  });

  it('does not start a second query while one is running', async () => {
    let finish!: (value: unknown) => void;
    const svc = service({ results: jest.fn().mockReturnValue(new Promise((resolve) => (finish = resolve))) });
    const update = setup(svc);

    const first = update.check('a1');
    const second = update.check('a1');
    finish(ok([]));

    expect(await first).toEqual(await second);
    expect(svc.results).toHaveBeenCalledTimes(1);
  });

  it('can query again once the previous query ended', async () => {
    const svc = service();
    const update = setup(svc);
    await update.check('a1');
    await update.check('a1');
    expect(svc.results).toHaveBeenCalledTimes(2);
  });
});

describe('createOfficialUpdate.importChosen', () => {
  it('sends the ids of the results the guardian chose, and reports what the server did', async () => {
    const svc = service({ importChosen: jest.fn().mockResolvedValue(ok({ importId: 'i9', inserted: 1, duplicates: 1, changes: 2 })) });
    expect(await setup(svc).importChosen('a1', [found({ id: 'f7' })])).toEqual({ kind: 'imported', inserted: 1, duplicates: 1, changes: 2 });
    expect(svc.importChosen).toHaveBeenCalledWith('a1', ['f7']);
  });

  it('sends an id once even if it was chosen twice', async () => {
    const svc = service();
    await setup(svc).importChosen('a1', [found({ id: 'f7' }), found({ id: 'f7' })]);
    expect(svc.importChosen).toHaveBeenCalledWith('a1', ['f7']);
  });

  it('does not call the server with nothing chosen', async () => {
    const svc = service();
    expect(await setup(svc).importChosen('a1', [])).toEqual({ kind: 'imported', inserted: 0, duplicates: 0, changes: 0 });
    expect(svc.importChosen).not.toHaveBeenCalled();
  });

  it('says the list expired when the server forgot it, so the screen asks again', async () => {
    const svc = service({ importChosen: jest.fn().mockResolvedValue(fail({ code: 'unknown_id' })) });
    expect(await setup(svc).importChosen('a1', [found()])).toEqual({ kind: 'expired' });
  });

  it.each([
    ['a refusal', jest.fn().mockResolvedValue(fail({ code: 'unavailable' }))],
    ['a thrown error', jest.fn().mockRejectedValue(new Error('network'))],
  ])('reports a failed import after %s', async (_name, importChosen) => {
    expect(await setup(service({ importChosen })).importChosen('a1', [found()])).toEqual({ kind: 'failed' });
  });
});

describe('createIdentityConfirmation', () => {
  const status = { confirmed: true, organizationId: 'o1', confirmedAt: '2026-10-28T10:00:00Z', candidateName: 'Synthetic Swimmer', hasNumber: true, lastThree: '123' };

  it('is confirmed when the server says so', async () => {
    expect(await createIdentityConfirmation(service({ status: jest.fn().mockResolvedValue(ok(status)) })).isConfirmed('a1')).toBe(true);
  });

  it.each([
    ['not confirmed', jest.fn().mockResolvedValue(ok({ ...status, confirmed: false }))],
    ['refused', jest.fn().mockResolvedValue(fail({ code: 'not_authorized' }))],
    ['offline', jest.fn().mockRejectedValue(new Error('network'))],
  ])('is not confirmed when %s', async (_name, statusCall) => {
    expect(await createIdentityConfirmation(service({ status: statusCall })).isConfirmed('a1')).toBe(false);
  });
});

describe('updateButtonState', () => {
  const base = { identityConfirmed: true, authorized: true, checking: false, lastUpdatedAt: null };

  it.each([
    ['without a confirmed identity', { identityConfirmed: false }],
    ['without the authorization in force', { authorized: false }],
  ])('hides the button %s', (_name, change) => {
    expect(updateButtonState({ ...base, ...change })).toEqual({ visible: false });
  });

  it('shows an enabled button when confirmed and authorized', () => {
    expect(updateButtonState(base)).toEqual({ visible: true, disabled: false, lastUpdatedAt: null });
  });

  it('disables the button while checking', () => {
    expect(updateButtonState({ ...base, checking: true })).toEqual({ visible: true, disabled: true, lastUpdatedAt: null });
  });

  it('carries the date of the last update', () => {
    expect(updateButtonState({ ...base, lastUpdatedAt: '2026-10-28' })).toMatchObject({ lastUpdatedAt: '2026-10-28' });
  });
});
