import { render, screen } from '@testing-library/react-native';

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
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console/data/useAdminSchool'),
  ...jest.requireActual('../modules/school-console/screens/ConsoleScreen'),
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

  it('shows nothing while the lookup is pending', async () => {
    mockListAdminSchools.mockReturnValue(new Promise(() => {}));
    await show();

    expect(screen.queryByText(/redirected/)).toBeNull();
    expect(screen.queryByRole('header')).toBeNull();
  });
});
