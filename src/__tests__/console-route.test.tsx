import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import ConsoleRoute from '../app/(app)/console';
import { colors, space, ThemeProvider, type ThemeName } from '../core/theme';

let mockUserId: string | undefined;
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({
  useGlobalSyncSummary: () => ({ lastSyncedAt: null, connected: true, connection: 'connected' }),
  useRecordSyncStates: () => new Map(),
}));
const mockListAdminSchools = jest.fn();
const mockConsoleAthletes = {
  listAthletes: jest.fn(),
  listAthleteGroups: jest.fn(),
  countMeasurementsSince: jest.fn(),
  listBests: jest.fn(),
};
const mockListCategories = jest.fn();
const mockListRecords = jest.fn();
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console/data/useAdminSchool'),
  ...jest.requireActual('../modules/school-console/screens/ConsoleScreen'),
  ...jest.requireActual('../modules/school-console/screens/AthletesSection'),
  createPowerSyncConsoleAthletesRepository: () => ({
    listAthletes: (...args: unknown[]) => mockConsoleAthletes.listAthletes(...args),
    listAthleteGroups: (...args: unknown[]) => mockConsoleAthletes.listAthleteGroups(...args),
    countMeasurementsSince: (...args: unknown[]) => mockConsoleAthletes.countMeasurementsSince(...args),
    listBests: (...args: unknown[]) => mockConsoleAthletes.listBests(...args),
  }),
  ...jest.requireActual('../modules/school-console/screens/CategoriesSection'),
  createPowerSyncCategoriesRepository: () => ({
    list: (...args: unknown[]) => mockListCategories(...args),
  }),
  ...jest.requireActual('../modules/school-console/screens/CoachesSection'),
  createPowerSyncCoachRepository: () => ({ listCoaches: () => Promise.resolve([]) }),
  ...jest.requireActual('../modules/school-console/screens/RecordsSection'),
  createPowerSyncCategoryRecordsRepository: () => ({ list: (...args: unknown[]) => mockListRecords(...args) }),
  createPowerSyncSchoolStructureRepository: () => ({ listGroups: () => Promise.resolve([]), listCoachAssignments: () => Promise.resolve([]) }),
  ...jest.requireActual('../modules/school-console/screens/MeasurementsSection'),
  createPowerSyncMeasurementLogRepository: () => ({ list: () => Promise.resolve([]) }),
  ...jest.requireActual('../modules/school-console/screens/AuthorizationsSection'),
  createPowerSyncAuthorizationsRepository: () => ({
    listAthletes: () => Promise.resolve([]),
    resend: () => Promise.reject(new Error('not used')),
    listSharingRequests: () => Promise.resolve([]),
    approveSharing: () => Promise.reject(new Error('not used')),
    withdrawSharing: () => Promise.reject(new Error('not used')),
  }),
  createPowerSyncStaffSchoolRepository: () => ({
    listAdminSchools: (...args: unknown[]) => mockListAdminSchools(...args),
  }),
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirected to ${href}`}</Text>,
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
  };
});

beforeEach(() => {
  mockUserId = 'user-1';
  mockReplace.mockReset();
  mockListAdminSchools.mockReset().mockResolvedValue([]);
  mockConsoleAthletes.listAthletes.mockReset().mockResolvedValue([]);
  mockConsoleAthletes.listAthleteGroups.mockReset().mockResolvedValue([]);
  mockConsoleAthletes.countMeasurementsSince.mockReset().mockResolvedValue(0);
  mockConsoleAthletes.listBests.mockReset().mockResolvedValue([]);
  mockListCategories.mockReset().mockResolvedValue([]);
  mockListRecords.mockReset().mockResolvedValue([]);
});

// The style tests name the theme they assert against; the others do not care and take the system one.
const show = (theme?: ThemeName) =>
  render(
    <ThemeProvider name={theme}>
      <ConsoleRoute />
    </ThemeProvider>,
  );

describe('console route', () => {
  it('sends a user who is not a school admin back to the home', async () => {
    await show();

    expect(await screen.findByText('redirected to /')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Deportistas' })).toBeNull();
  });

  it('shows the error view, not a redirect, when the lookup fails, and the console once a retry works', async () => {
    mockListAdminSchools.mockRejectedValueOnce(new Error('db')).mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    await show();

    expect(await screen.findByText('No pudimos cargar tu escuela')).toBeOnTheScreen();
    expect(screen.getByText('Intenta de nuevo. Si sigue pasando, cierra la app y vuelve a abrirla.')).toBeOnTheScreen();
    expect(screen.queryByText('Revisa tu conexión e inténtalo de nuevo.')).toBeNull();
    expect(screen.queryByText(/redirected/)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByRole('header', { name: 'Deportistas' })).toBeOnTheScreen();
    expect(screen.queryByText('No pudimos cargar tu escuela')).toBeNull();
    expect(mockListAdminSchools).toHaveBeenCalledTimes(2);
  });

  it('shows the loading state, not the error view, while a retry runs, and the console once it answers', async () => {
    let answer: (schools: unknown[]) => void = () => {};
    mockListAdminSchools.mockRejectedValueOnce(new Error('db')).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await show();

    await fireEvent.press(await screen.findByRole('button', { name: 'Intentar de nuevo' }));

    expect(screen.getByTestId('state-view')).toBeBusy();
    expect(screen.queryByText('No pudimos cargar tu escuela')).toBeNull();

    await act(async () => answer([{ id: 's1', name: 'Escuela Delfines' }]));

    expect(await screen.findByRole('header', { name: 'Deportistas' })).toBeOnTheScreen();
  });

  it('shows the loading state, not a blank screen or a redirect, while the first lookup is pending', async () => {
    mockListAdminSchools.mockReturnValue(new Promise(() => {}));
    await show();

    expect(screen.getByTestId('state-view')).toBeBusy();
    expect(screen.queryByText(/redirected/)).toBeNull();
    expect(screen.queryByRole('header')).toBeNull();
  });

  it('offers a way home below the retry in the error view, and no sign out', async () => {
    mockListAdminSchools.mockRejectedValue(new Error('db'));
    await show();

    await screen.findByRole('button', { name: 'Intentar de nuevo' });
    const home = screen.getByRole('button', { name: 'Volver al inicio' });
    const container = screen.getByTestId('access-error');
    const labels = within(container).getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['Intentar de nuevo', 'Volver al inicio']);
    // Nothing else sits in the container: a stray child that is not a button would pass the labels check.
    expect(container.children).toHaveLength(2);
    // Tree order is not what the user sees: the container must stack its children top to bottom, in that order, in flow.
    expect(StyleSheet.flatten(container.props.style).flexDirection ?? 'column').toBe('column');
    expect(StyleSheet.flatten(screen.getByTestId('access-error-home').props.style).position).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();

    await fireEvent.press(home);

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('draws the retry as secondary, not as the lime primary', async () => {
    mockListAdminSchools.mockRejectedValue(new Error('db'));
    await show('light');
    const retry = await screen.findByRole('button', { name: 'Intentar de nuevo' });

    // Secondary: surface background, visible outline, label not underlined.
    const retryStyle = StyleSheet.flatten(retry.props.style);
    expect(retryStyle.backgroundColor).toBe(colors.light['surface-1']);
    expect(retryStyle.borderColor).toBe(colors.light.border);
    expect(StyleSheet.flatten(screen.getByText('Intentar de nuevo').props.style).textDecorationLine).toBeUndefined();
  });

  it('draws the way home as ghost, not as the lime primary', async () => {
    mockListAdminSchools.mockRejectedValue(new Error('db'));
    await show('light');
    const home = await screen.findByRole('button', { name: 'Volver al inicio' });

    const homeStyle = StyleSheet.flatten(home.props.style);
    // Ghost: no background, no outline, underlined label.
    expect(homeStyle.backgroundColor).toBe('transparent');
    expect(homeStyle.borderColor).toBe('transparent');
    expect(StyleSheet.flatten(screen.getByText('Volver al inicio').props.style).textDecorationLine).toBe('underline');
  });

  it('separates the way home from the error view with a design-system space', async () => {
    mockListAdminSchools.mockRejectedValue(new Error('db'));
    await show();
    await screen.findByRole('button', { name: 'Volver al inicio' });

    expect(StyleSheet.flatten(screen.getByTestId('access-error-home').props.style).marginTop).toBe(space[4]);
  });

  it('sends the user home when the retry finds no admin school', async () => {
    mockListAdminSchools.mockRejectedValueOnce(new Error('db')).mockResolvedValue([]);
    await show();

    await fireEvent.press(await screen.findByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByText('redirected to /')).toBeOnTheScreen();
  });

  it('sends a signed-out user back to the home', async () => {
    mockUserId = undefined;
    await show();

    expect(await screen.findByText('redirected to /')).toBeOnTheScreen();
  });

  it('shows the console of the school to a school admin', async () => {
    mockListAdminSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    await show();

    expect(await screen.findByRole('header', { name: 'Deportistas' })).toBeOnTheScreen();
    expect(screen.queryByText(/redirected/)).toBeNull();
  });

  it('opens the existing plans route from the Planes destination', async () => {
    mockListAdminSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    await show();
    await screen.findByRole('header', { name: 'Deportistas' });

    await fireEvent.press(screen.getByRole('tab', { name: 'Planes' }));

    expect(mockPush).toHaveBeenCalledWith('/plans');
    expect(screen.getByRole('header', { name: 'Deportistas' })).toBeOnTheScreen();
  });

  it('loads the athletes of the admin school from the local database', async () => {
    mockListAdminSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    mockConsoleAthletes.listAthletes.mockResolvedValue([
      {
        id: 'a1',
        name: 'Lucía Ramírez',
        initials: 'LR',
        color: 'athlete-1',
        categoryId: null,
        category: null,
        categorySortOrder: null,
        groupIds: [],
        groups: [],
        coachIds: [],
        authorization: 'pending',
        bestTime: null,
      },
    ]);
    await show();

    expect(await screen.findByRole('button', { name: /^Lucía Ramírez/ })).toBeOnTheScreen();
    expect(mockConsoleAthletes.listAthletes).toHaveBeenCalledWith('s1');
  });

  it('shows the categories of the school of the admin under Ajustes', async () => {
    mockListAdminSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    mockListCategories.mockResolvedValue([{ id: 'c1', schoolId: 's1', name: 'Categoría A', sortOrder: 0, active: true }]);
    await show();

    await fireEvent.press(await screen.findByRole('tab', { name: 'Ajustes' }));

    expect(await screen.findByRole('header', { name: 'Categorías' })).toBeOnTheScreen();
    expect(await screen.findByText('Categoría A')).toBeOnTheScreen();
    expect(mockListCategories).toHaveBeenCalledWith('s1');
  });

  it.each([
    ['Entrenadores', 'Aún no hay entrenadores'],
    ['Mediciones', 'Aún no hay mediciones'],
    ['Autorizaciones', 'Aún no hay autorizaciones'],
  ])('shows the %s screen, not the empty section, until its data is connected', async (tab, emptyTitle) => {
    mockListAdminSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    await show();
    await fireEvent.press(await screen.findByRole('tab', { name: tab }));

    expect(screen.getByRole('header', { name: tab })).toBeOnTheScreen();
    expect(screen.getByText(emptyTitle)).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: tab })).toBeSelected();
  });

  it('shows the best marks of the first category of the school of the admin under Récords', async () => {
    mockListAdminSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    mockListCategories.mockResolvedValue([{ id: 'c1', schoolId: 's1', name: 'Categoría A', sortOrder: 0, active: true }]);
    mockListRecords.mockResolvedValue([{ stroke: 'FR', distance: '50m', time: 3391, athlete: 'Mateo Castro', date: '2026-02-12' }]);
    await show();

    await fireEvent.press(await screen.findByRole('tab', { name: 'Récords' }));

    expect(await screen.findByText('Libre 50', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Categoría: Categoría A' })).toBeOnTheScreen();
    expect(mockListRecords).toHaveBeenCalledWith({ schoolId: 's1', categoryId: 'c1', pool: 'SCM', groupId: null });
  });

  it('shows the empty Récords state when the school has no category', async () => {
    mockListAdminSchools.mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    await show();
    await fireEvent.press(await screen.findByRole('tab', { name: 'Récords' }));

    expect(await screen.findByText('Aún no hay récords')).toBeOnTheScreen();
  });
});
