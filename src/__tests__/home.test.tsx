import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Home from '../app/(app)/index';
import { t } from '../core/i18n';

let mockSummary: { pending: number; failed: number; uploading: boolean; lastSyncedAt: Date | null };
// The real recordSyncState: only the hook, which needs the native database, is replaced.
jest.mock('../core/sync', () => ({
  ...jest.requireActual('../core/sync/syncState'),
  useGlobalSyncSummary: () => mockSummary,
}));
let mockSyncConnectFailed = false;
const mockSignOut = jest.fn();
jest.mock('../core/session', () => ({
  useSession: () => ({ syncConnectFailed: mockSyncConnectFailed, signOut: mockSignOut, session: { user: { id: 'user-1' } } }),
}));
const mockListStaffSchools = jest.fn();
const mockListAdminSchools = jest.fn();
jest.mock('../modules/school-console', () => ({
  // The real hook: only the repository, which needs the native database, is replaced.
  ...jest.requireActual('../modules/school-console/data/useAdminSchool'),
  createPowerSyncStaffSchoolRepository: () => ({
    listStaffSchools: (...args: unknown[]) => mockListStaffSchools(...args),
    listAdminSchools: (...args: unknown[]) => mockListAdminSchools(...args),
  }),
}));
const mockListManagedAthleteIds = jest.fn();
const mockClearDraft = jest.fn();
const mockClearPending = jest.fn();
jest.mock('../modules/accounts', () => ({
  createSecureStoreRegistrationDraftRepository: () => ({ clear: () => mockClearDraft() }),
  createSecureStorePendingInvitationRepository: () => ({ clear: (userId: string) => mockClearPending(userId) }),
  createPowerSyncManagedAthleteRepository: () => ({ listManagedAthleteIds: (...args: unknown[]) => mockListManagedAthleteIds(...args) }),
}));
const mockListByIds = jest.fn();
jest.mock('../modules/athletes', () => ({
  // The real hook and display helper: only the repository, which needs the native database, is replaced.
  ...jest.requireActual('../modules/athletes/data/useManagedAthletes'),
  ...jest.requireActual('../modules/athletes/athleteDisplay'),
  createPowerSyncSchoolAthleteRepository: () => ({ listByIds: (...args: unknown[]) => mockListByIds(...args) }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useRouter: () => ({ push: mockPush }) }));
jest.mock('@powersync/react', () => ({}));
jest.mock('../core/sync/db', () => ({ db: {} }));

beforeEach(() => {
  mockSummary = { pending: 0, failed: 0, uploading: false, lastSyncedAt: null };
  mockSyncConnectFailed = false;
  mockSignOut.mockReset().mockResolvedValue({ status: 'signed_out' });
  mockClearDraft.mockReset().mockResolvedValue(undefined);
  mockClearPending.mockReset().mockResolvedValue(undefined);
  mockListStaffSchools.mockReset().mockResolvedValue([]);
  mockListAdminSchools.mockReset().mockResolvedValue([]);
  mockListManagedAthleteIds.mockReset().mockResolvedValue([]);
  mockListByIds.mockReset().mockResolvedValue([]);
  mockPush.mockClear();
});

// Lives outside src/app: Expo Router would treat a test file there as a route.
describe('home screen', () => {
  it('shows the app title', async () => {
    await render(<Home />);

    expect(screen.getByText('TrailSkill')).toBeTruthy();
  });

  it('shows records waiting on the phone', async () => {
    mockSummary = { ...mockSummary, pending: 2 };
    await render(<Home />);

    expect(screen.getByLabelText('En el teléfono')).toBeOnTheScreen();
  });

  it('shows records the server rejected', async () => {
    mockSummary = { ...mockSummary, failed: 1 };
    await render(<Home />);

    expect(screen.getByLabelText('No enviado')).toBeOnTheScreen();
  });

  it('shows everything sent when nothing is pending', async () => {
    await render(<Home />);

    expect(screen.getByLabelText('Enviado')).toBeOnTheScreen();
  });

  it('tells the person when sync could not connect', async () => {
    mockSyncConnectFailed = true;
    await render(<Home />);

    expect(
      screen.getByText('No pudimos conectar la sincronización. Tus registros siguen guardados en el teléfono.'),
    ).toBeOnTheScreen();
  });

  it('shows no sync connection message when it connected', async () => {
    await render(<Home />);

    expect(screen.queryByText(/No pudimos conectar la sincronización/)).toBeNull();
  });
});

describe('training plans button', () => {
  const plans = { name: 'Planes de entrenamiento' };

  it('is hidden from a user who is not school staff', async () => {
    await render(<Home />);

    expect(mockListStaffSchools).toHaveBeenCalledWith('user-1');
    expect(screen.queryByRole('button', plans)).toBeNull();
  });

  it('is hidden when the lookup fails', async () => {
    mockListStaffSchools.mockRejectedValue(new Error('db'));
    await render(<Home />);

    expect(screen.queryByRole('button', plans)).toBeNull();
  });

  it('opens the plans for school staff', async () => {
    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela' }]);
    await render(<Home />);

    await fireEvent.press(await screen.findByRole('button', plans));

    expect(mockPush).toHaveBeenCalledWith('/plans');
  });

  it('appears once memberships arrive with a later sync', async () => {
    const { rerender } = await render(<Home />);
    expect(screen.queryByRole('button', plans)).toBeNull();

    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela' }]);
    mockSummary = { ...mockSummary, lastSyncedAt: new Date(1000) };
    await rerender(<Home />);

    expect(await screen.findByRole('button', plans)).toBeOnTheScreen();
  });
});

describe('console button', () => {
  const consoleButton = { name: 'Consola' };

  it('is hidden from school staff who are not school admins', async () => {
    mockListStaffSchools.mockResolvedValue([{ id: 's1', name: 'Escuela' }]);
    await render(<Home />);

    expect(await screen.findByRole('button', { name: 'Planes de entrenamiento' })).toBeOnTheScreen();
    expect(mockListAdminSchools).toHaveBeenCalledWith('user-1');
    expect(screen.queryByRole('button', consoleButton)).toBeNull();
  });

  it('is hidden when the lookup fails', async () => {
    mockListAdminSchools.mockRejectedValue(new Error('db'));
    await render(<Home />);

    expect(screen.queryByRole('button', consoleButton)).toBeNull();
  });

  it('opens the console for a school admin', async () => {
    mockListAdminSchools.mockResolvedValue([{ id: 's1', name: 'Escuela' }]);
    await render(<Home />);

    await fireEvent.press(await screen.findByRole('button', consoleButton));

    expect(mockPush).toHaveBeenCalledWith('/console');
  });
});

describe('sign out from home', () => {
  const pendingTitle = '¿Cerrar sesión con registros sin enviar?';

  it('signs out at once when nothing is unsent', async () => {
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(mockSignOut).toHaveBeenCalledWith();
    expect(screen.queryByRole('header', { name: pendingTitle })).toBeNull();
    await waitFor(() => expect(mockClearDraft).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockClearPending).toHaveBeenCalledWith('user-1'));
  });

  it('keeps the registration draft when the sign-out is blocked', async () => {
    mockSignOut.mockResolvedValue({ status: 'blocked_pending', unsent: 1, rejected: 0 });
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('header', { name: pendingTitle });

    expect(mockClearDraft).not.toHaveBeenCalled();
    expect(mockClearPending).not.toHaveBeenCalled();
  });

  it('warns with the number of unsent records, and continuing keeps the session', async () => {
    mockSignOut.mockResolvedValue({ status: 'blocked_pending', unsent: 3, rejected: 0 });
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('header', { name: pendingTitle })).toBeOnTheScreen();
    expect(screen.getByText(/Hay 3 registros sin enviar/)).toBeOnTheScreen();
    expect(screen.queryByText(/no se pudieron enviar/)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Seguir y enviar' }));

    expect(screen.queryByRole('header', { name: pendingTitle })).toBeNull();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('uses the singular for one unsent record', async () => {
    mockSignOut.mockResolvedValue({ status: 'blocked_pending', unsent: 1, rejected: 0 });
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByText(/Hay 1 registro sin enviar/)).toBeOnTheScreen();
  });

  it('says that rejected records will not be sent on their own', async () => {
    mockSignOut.mockResolvedValue({ status: 'blocked_pending', unsent: 3, rejected: 2 });
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByText(/2 de ellos no se pudieron enviar/)).toBeOnTheScreen();
  });

  it('signs out anyway with force', async () => {
    mockSignOut.mockResolvedValueOnce({ status: 'blocked_pending', unsent: 3, rejected: 0 });
    await render(<Home />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Cerrar sesión igual' }));

    expect(mockSignOut).toHaveBeenLastCalledWith({ force: true });
  });

  it('ignores a second press while signing out is in progress', async () => {
    let finish: (result: { status: 'signed_out' }) => void = () => {};
    mockSignOut.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await render(<Home />);
    const button = screen.getByRole('button', { name: 'Cerrar sesión' });

    // Both presses land before React re-renders the button as loading, so only the handler itself can ignore the second (Pressable's onClick is the keyboard and accessibility press).
    const click = () => button.props.onClick({ stopPropagation() {}, nativeEvent: {} });
    await act(async () => {
      click();
      click();
      finish({ status: 'signed_out' });
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it.each([
    [true, true],
    [false, false],
  ])('with sync connect failed %p the warning says records go out on reconnect: %p', async (connectFailed, shown) => {
    mockSyncConnectFailed = connectFailed;
    mockSignOut.mockResolvedValue({ status: 'blocked_pending', unsent: 3, rejected: 0 });
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await screen.findByRole('header', { name: pendingTitle });
    expect(screen.queryByText(/si sigues en la sesión, se envían cuando vuelva la conexión/) !== null).toBe(shown);
  });

  it('tells the person when signing out failed', async () => {
    mockSignOut.mockRejectedValue(new Error('storage'));
    await render(<Home />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByText('No pudimos cerrar la sesión. Inténtalo de nuevo.')).toBeOnTheScreen();
  });
});

describe('t', () => {
  it('returns the es-CO text of a known key', () => {
    expect(t('home.title')).toBe('TrailSkill');
  });

  it('returns the key itself when the translation is missing', () => {
    expect(t('home.missing')).toBe('home.missing');
  });
});

describe('home by role', () => {
  const school = [{ id: 's1', name: 'Escuela Delfines' }];

  it('gives a guardian a button to their athletes', async () => {
    mockListManagedAthleteIds.mockResolvedValue(['a1']);
    mockListByIds.mockResolvedValue([{ id: 'a1', firstName: 'Ana', lastName: 'Marin', categoryId: null, groupIds: [] }]);
    await render(<Home />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Deportistas' }));

    expect(mockPush).toHaveBeenCalledWith('/athletes');
  });

  it('shows a guardian neither the timing, the plans nor the console', async () => {
    mockListManagedAthleteIds.mockResolvedValue(['a1']);
    mockListByIds.mockResolvedValue([{ id: 'a1', firstName: 'Ana', lastName: 'Marin', categoryId: null, groupIds: [] }]);
    await render(<Home />);
    await screen.findByRole('button', { name: 'Deportistas' });

    expect(screen.queryByRole('button', { name: 'Toma de tiempos' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Toma en serie' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Planes de entrenamiento' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Consola' })).toBeNull();
  });

  it('opens the timing for a coach, who sees no console and no athlete list', async () => {
    mockListStaffSchools.mockResolvedValue(school);
    await render(<Home />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Toma de tiempos' }));

    expect(mockPush).toHaveBeenCalledWith('/timing');
    await fireEvent.press(screen.getByRole('button', { name: 'Toma en serie' }));
    expect(mockPush).toHaveBeenCalledWith('/timing?mode=series');
    expect(screen.getByRole('button', { name: 'Planes de entrenamiento' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Consola' })).toBeNull();
  });

  it('shows a school admin the timing, the plans and the console', async () => {
    mockListStaffSchools.mockResolvedValue(school);
    mockListAdminSchools.mockResolvedValue(school);
    await render(<Home />);

    expect(await screen.findByRole('button', { name: 'Consola' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Toma de tiempos' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Planes de entrenamiento' })).toBeOnTheScreen();
  });
});
