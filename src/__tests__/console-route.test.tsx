import { fireEvent, render, screen } from '@testing-library/react-native';

import ConsoleRoute from '../app/(app)/console';
import { ThemeProvider } from '../core/theme';

let mockUserId: string | undefined;
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({
  useGlobalSyncSummary: () => ({ lastSyncedAt: null, connected: true, connection: 'connected' }),
}));
const mockListAdminSchools = jest.fn();
const mockConsoleAthletes = {
  listAthletes: jest.fn(),
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
    countMeasurementsSince: (...args: unknown[]) => mockConsoleAthletes.countMeasurementsSince(...args),
    listBests: (...args: unknown[]) => mockConsoleAthletes.listBests(...args),
  }),
  ...jest.requireActual('../modules/school-console/screens/CategoriesSection'),
  createPowerSyncCategoriesRepository: () => ({
    list: (...args: unknown[]) => mockListCategories(...args),
  }),
  ...jest.requireActual('../modules/school-console/screens/CoachesScreen'),
  ...jest.requireActual('../modules/school-console/screens/RecordsSection'),
  createPowerSyncCategoryRecordsRepository: () => ({ list: (...args: unknown[]) => mockListRecords(...args) }),
  createPowerSyncSchoolStructureRepository: () => ({ listGroups: () => Promise.resolve([]) }),
  ...jest.requireActual('../modules/school-console/screens/MeasurementsScreen'),
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
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return { Redirect: ({ href }: { href: string }) => <Text>{`redirected to ${href}`}</Text> };
});

beforeEach(() => {
  mockUserId = 'user-1';
  mockListAdminSchools.mockReset().mockResolvedValue([]);
  mockConsoleAthletes.listAthletes.mockReset().mockResolvedValue([]);
  mockConsoleAthletes.countMeasurementsSince.mockReset().mockResolvedValue(0);
  mockConsoleAthletes.listBests.mockReset().mockResolvedValue([]);
  mockListCategories.mockReset().mockResolvedValue([]);
  mockListRecords.mockReset().mockResolvedValue([]);
});

const show = () =>
  render(
    <ThemeProvider>
      <ConsoleRoute />
    </ThemeProvider>,
  );

describe('console route', () => {
  it('sends a user who is not a school admin back to the home', async () => {
    await show();

    expect(await screen.findByText('redirected to /')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Deportistas' })).toBeNull();
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

  it('shows nothing while the lookup is pending', async () => {
    mockListAdminSchools.mockReturnValue(new Promise(() => {}));
    await show();

    expect(screen.queryByText(/redirected/)).toBeNull();
    expect(screen.queryByRole('header')).toBeNull();
  });
});
