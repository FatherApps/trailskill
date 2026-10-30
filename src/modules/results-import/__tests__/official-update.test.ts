import {
  createInMemoryImportedResultsRepository,
  createOfficialUpdate,
  sortOutFound,
  updateButtonState,
  type FoundResult,
  type ImportedResult,
  type OfficialResultsService,
  type PendingResultChange,
} from '..';

const found = (overrides: Partial<FoundResult> = {}): FoundResult => ({
  sourceResultKey: 'k1',
  stroke: 'FR',
  distance: '50m',
  pool: 'LCM',
  hundredths: 2890,
  swumOn: '2026-03-14',
  competition: 'Synthetic Open',
  ...overrides,
});

const imported = (overrides: Partial<ImportedResult> = {}): ImportedResult => ({
  id: 'r1',
  athleteId: 'a1',
  importId: 'i1',
  provider: 'zz-test',
  revision: 1,
  supersedesId: null,
  createdAt: '2026-10-28T10:00:00Z',
  ...found(),
  ...overrides,
});

const pending = (overrides: Partial<PendingResultChange> = {}): PendingResultChange => ({
  id: 'c1',
  importedResultId: 'r1',
  athleteId: 'a1',
  importId: 'i2',
  createdAt: '2026-10-28T11:00:00Z',
  ...found({ hundredths: 2850 }),
  ...overrides,
});

describe('sortOutFound', () => {
  it('lists a result the athlete does not have as new', () => {
    expect(sortOutFound([found({ sourceResultKey: 'k9' })], [imported()], [])).toEqual([
      { kind: 'new', result: found({ sourceResultKey: 'k9' }) },
    ]);
  });

  it('drops a result that is already imported with the same values', () => {
    expect(sortOutFound([found()], [imported()], [])).toEqual([]);
  });

  it('lists a result whose values changed at the source, with the value the app shows now', () => {
    const items = sortOutFound([found({ hundredths: 2850 })], [imported()], []);
    expect(items).toEqual([{ kind: 'changed', result: found({ hundredths: 2850 }), current: imported() }]);
  });

  it('drops a change the guardian has not answered yet', () => {
    expect(sortOutFound([found({ hundredths: 2850 })], [imported()], [pending()])).toEqual([]);
  });

  it('keeps a missing time as null, never zero', () => {
    const [item] = sortOutFound([found({ sourceResultKey: 'k9', hundredths: null })], [], []);
    expect(item?.result.hundredths).toBeNull();
  });

  it('compares a missing time with a time as a change', () => {
    const items = sortOutFound([found({ hundredths: null })], [imported()], []);
    expect(items.map((item) => item.kind)).toEqual(['changed']);
  });

  it('lists the same result once when the source repeats it', () => {
    expect(sortOutFound([found({ sourceResultKey: 'k9' }), found({ sourceResultKey: 'k9' })], [], [])).toHaveLength(1);
  });
});

function service(overrides: Partial<OfficialResultsService> = {}): jest.Mocked<OfficialResultsService> {
  return {
    refresh: jest.fn().mockResolvedValue({ ok: true, value: [found({ sourceResultKey: 'k9' })] }),
    importChosen: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    ...overrides,
  } as jest.Mocked<OfficialResultsService>;
}

const setup = (svc = service(), results: ImportedResult[] = [imported()], changes: (PendingResultChange & { status: 'pending' })[] = []) =>
  createOfficialUpdate({ service: svc, repository: createInMemoryImportedResultsRepository(results, changes) });

describe('createOfficialUpdate.check', () => {
  it('offers the new results, preselected', async () => {
    const outcome = await setup().check('a1');
    expect(outcome).toEqual({ kind: 'found', items: [{ kind: 'new', result: found({ sourceResultKey: 'k9' }) }] });
  });

  it('says there is nothing new when every result is already imported', async () => {
    const svc = service({ refresh: jest.fn().mockResolvedValue({ ok: true, value: [found()] }) });
    expect(await setup(svc).check('a1')).toEqual({ kind: 'none' });
  });

  it('reports when the next try is allowed', async () => {
    const svc = service({ refresh: jest.fn().mockResolvedValue({ ok: false, error: { code: 'rate_limited', retryAt: '2026-10-29T12:10:00Z' } }) });
    expect(await setup(svc).check('a1')).toEqual({ kind: 'rate_limited', retryAt: '2026-10-29T12:10:00Z' });
  });

  it.each([
    ['unavailable', { code: 'unavailable' }],
    ['not authorized', { code: 'not_authorized' }],
    ['no provider', { code: 'no_provider' }],
  ])('says unavailable when the server answers %s', async (_name, error) => {
    const svc = service({ refresh: jest.fn().mockResolvedValue({ ok: false, error }) });
    expect(await setup(svc).check('a1')).toEqual({ kind: 'unavailable' });
  });

  it('says unavailable when the request throws, as when offline', async () => {
    const svc = service({ refresh: jest.fn().mockRejectedValue(new Error('network')) });
    expect(await setup(svc).check('a1')).toEqual({ kind: 'unavailable' });
  });

  it('does not start a second query while one is running', async () => {
    let finish!: (value: unknown) => void;
    const svc = service({ refresh: jest.fn().mockReturnValue(new Promise((resolve) => (finish = resolve))) });
    const update = setup(svc);

    const first = update.check('a1');
    const second = update.check('a1');
    finish({ ok: true, value: [] });

    expect(await first).toEqual(await second);
    expect(svc.refresh).toHaveBeenCalledTimes(1);
  });

  it('can query again once the previous query ended', async () => {
    const svc = service();
    const update = setup(svc);
    await update.check('a1');
    await update.check('a1');
    expect(svc.refresh).toHaveBeenCalledTimes(2);
  });
});

describe('createOfficialUpdate.importChosen', () => {
  it('sends only the results the guardian chose', async () => {
    const svc = service();
    const chosen = [found({ sourceResultKey: 'k9' })];
    expect(await setup(svc).importChosen('a1', chosen)).toEqual({ kind: 'imported', count: 1 });
    expect(svc.importChosen).toHaveBeenCalledWith('a1', chosen);
  });

  it('sends a result once even if it was chosen twice', async () => {
    const svc = service();
    await setup(svc).importChosen('a1', [found({ sourceResultKey: 'k9' }), found({ sourceResultKey: 'k9' })]);
    expect(svc.importChosen).toHaveBeenCalledWith('a1', [found({ sourceResultKey: 'k9' })]);
  });

  it('does not call the server with nothing chosen', async () => {
    const svc = service();
    expect(await setup(svc).importChosen('a1', [])).toEqual({ kind: 'imported', count: 0 });
    expect(svc.importChosen).not.toHaveBeenCalled();
  });

  it.each([
    ['a refusal', jest.fn().mockResolvedValue({ ok: false, error: { code: 'unavailable' } })],
    ['a thrown error', jest.fn().mockRejectedValue(new Error('network'))],
  ])('reports a failed import after %s', async (_name, importChosen) => {
    expect(await setup(service({ importChosen })).importChosen('a1', [found({ sourceResultKey: 'k9' })])).toEqual({ kind: 'failed' });
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
