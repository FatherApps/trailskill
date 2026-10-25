import {
  createInMemorySessionSetupRepository,
  createSecureStoreSessionSetupRepository,
  initialChoice,
  restoreSetup,
  type SessionSetup,
} from '../data/sessionSetup';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mockStore.set(key, value),
  deleteItemAsync: async (key: string) => void mockStore.delete(key),
}));

// Synthetic data only.
const setup: SessionSetup = { choice: { stroke: 'BK', distance: '100m', pool: 'LCM', sessionType: 'competition' }, selectedIds: ['a3', 'a1'] };

beforeEach(() => mockStore.clear());

describe.each([
  ['in memory', () => createInMemorySessionSetupRepository()],
  ['SecureStore', () => createSecureStoreSessionSetupRepository()],
])('session setup repository (%s)', (_name, create) => {
  it('loads nothing at first, then what was saved', async () => {
    const setups = create();
    expect(await setups.load()).toBeNull();

    await setups.save(setup);
    expect(await setups.load()).toEqual(setup);
  });
});

describe('SecureStore session setup', () => {
  it('loads null when the stored text is not valid', async () => {
    const setups = createSecureStoreSessionSetupRepository();
    await setups.save(setup);
    mockStore.set([...mockStore.keys()][0]!, '{not json');

    expect(await setups.load()).toBeNull();
  });
});

describe('SecureStore session setup with a big roster', () => {
  const ids = Array.from({ length: 128 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

  it('saves only the event when the ids would pass what SecureStore accepts, and restores everyone authorized', async () => {
    const setups = createSecureStoreSessionSetupRepository();

    await setups.save({ ...setup, selectedIds: ids });

    const saved = await setups.load();
    expect(saved).toEqual({ choice: setup.choice, selectedIds: [] });
    expect(restoreSetup(saved, ids)).toEqual({ choice: setup.choice, selectedIds: ids });
    expect([...mockStore.values()].every((value) => value.length <= 2048)).toBe(true);
  });
});

describe('restoreSetup', () => {
  it('keeps a valid saved setup, with the athletes in the order they were chosen', () => {
    expect(restoreSetup(setup, ['a1', 'a2', 'a3'])).toEqual(setup);
  });

  it('defaults to the event of a new session and everyone authorized when nothing was saved', () => {
    expect(restoreSetup(null, ['a1', 'a2'])).toEqual({ choice: initialChoice, selectedIds: ['a1', 'a2'] });
  });

  it('drops athletes who are no longer authorized or on the device, and repeated ones', () => {
    const saved = { ...setup, selectedIds: ['a3', 'gone', 'a1', 'a3'] };

    expect(restoreSetup(saved, ['a1', 'a3']).selectedIds).toEqual(['a3', 'a1']);
  });

  it('chooses everyone again when none of the saved athletes is available', () => {
    expect(restoreSetup(setup, ['a7', 'a8']).selectedIds).toEqual(['a7', 'a8']);
  });

  it('replaces a value that is not in the sport catalogs, one by one', () => {
    const saved = { choice: { stroke: 'XX', distance: '100m', pool: 'nope', sessionType: 'party' }, selectedIds: ['a1'] } as unknown as SessionSetup;

    expect(restoreSetup(saved, ['a1']).choice).toEqual({ ...initialChoice, distance: '100m' });
  });
});
