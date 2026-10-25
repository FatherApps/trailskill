import { fireEvent, render, screen } from '@testing-library/react-native';

import ConsoleRoute from '../app/(app)/console';
import { ThemeProvider } from '../core/theme';

let mockUserId: string | undefined;
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({
  useGlobalSyncSummary: () => ({ lastSyncedAt: null }),
}));
const mockListAdminSchools = jest.fn();
const mockListCategories = jest.fn();
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console/data/useAdminSchool'),
  ...jest.requireActual('../modules/school-console/screens/ConsoleScreen'),
  ...jest.requireActual('../modules/school-console/screens/CategoriesSection'),
  createPowerSyncCategoriesRepository: () => ({
    list: (...args: unknown[]) => mockListCategories(...args),
  }),
  ...jest.requireActual('../modules/school-console/screens/CoachesScreen'),
  ...jest.requireActual('../modules/school-console/screens/RecordsScreen'),
  ...jest.requireActual('../modules/school-console/screens/MeasurementsScreen'),
  ...jest.requireActual('../modules/school-console/screens/AuthorizationsScreen'),
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
  mockListCategories.mockReset().mockResolvedValue([]);
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
    ['Récords', 'Aún no hay récords'],
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

  it('shows nothing while the lookup is pending', async () => {
    mockListAdminSchools.mockReturnValue(new Promise(() => {}));
    await show();

    expect(screen.queryByText(/redirected/)).toBeNull();
    expect(screen.queryByRole('header')).toBeNull();
  });
});
