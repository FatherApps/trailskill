import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import MySwimmersRoute from '../app/(app)/my-swimmers';
import { t } from '../core/i18n';
import { ThemeProvider } from '../core/theme';

let mockUserId: string | undefined;
let mockPlatformAdmin = false;
const mockSignOut = jest.fn();
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null, signOut: mockSignOut }),
}));
jest.mock('../core/sync', () => ({
  useGlobalSyncSummary: () => ({ lastSyncedAt: new Date(2026, 9, 24, 11, 55, 0), connected: true, connection: 'connected' }),
}));
const mockListCoachSchools = jest.fn();
const mockListAthletes = jest.fn();
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console/data/useAdminSchool'),
  ...jest.requireActual('../modules/school-console/screens/MySwimmersSection'),
  ...jest.requireActual('../modules/school-console/components/StaffEntries'),
  createPowerSyncStaffSchoolRepository: () => ({ listCoachSchools: (...args: unknown[]) => mockListCoachSchools(...args) }),
  createPowerSyncConsoleAthletesRepository: () => ({ listAthletes: (...args: unknown[]) => mockListAthletes(...args) }),
}));
jest.mock('../modules/athletes', () => jest.requireActual('../modules/athletes/athleteProfileHref'));
jest.mock('../modules/accounts', () => ({
  // The real container: only the repositories it receives, which need the device storage, are replaced.
  ...jest.requireActual('../modules/accounts/screens/SignOutContainer'),
  createSecureStoreRegistrationDraftRepository: () => ({ clear: () => Promise.resolve() }),
  createSecureStorePendingInvitationRepository: () => ({ clear: () => Promise.resolve() }),
}));
jest.mock('../modules/timing', () => ({
  ...jest.requireActual('../modules/timing/data/usePlatformAdmin'),
  createSupabaseConflictReviewRepository: () => ({ isPlatformAdmin: () => Promise.resolve(mockPlatformAdmin) }),
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirected to ${href}`}</Text>,
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack, canGoBack: () => true }),
  };
});

// Synthetic data only: the coach is user-1; Sara belongs to another coach of the same school.
const athlete = (id: string, name: string, coachIds: string[]) => ({
  id,
  name,
  initials: name.slice(0, 1),
  color: 'athlete-1',
  categoryId: null,
  category: null,
  categorySortOrder: null,
  groupIds: [],
  groups: [],
  coachIds,
  authorization: 'valid',
  bestTime: null,
});

beforeEach(() => {
  mockUserId = 'user-1';
  mockPlatformAdmin = false;
  mockSignOut.mockReset().mockResolvedValue({ status: 'signed_out' });
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockListCoachSchools.mockReset().mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
  mockListAthletes.mockReset().mockResolvedValue([
    athlete('a1', 'Lucía Ramírez', ['user-1']),
    athlete('a3', 'Sara Peña', ['user-2']),
  ]);
});

const show = () =>
  render(
    <ThemeProvider>
      <MySwimmersRoute />
    </ThemeProvider>,
  );

describe('my swimmers route', () => {
  it('shows a coach their own athletes and no one else’s, with a back button and no console sections', async () => {
    await show();

    expect(await screen.findByRole('button', { name: /^Lucía Ramírez/ })).toBeOnTheScreen();
    expect(screen.queryByText(/Sara Peña/, { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(mockListCoachSchools).toHaveBeenCalledWith('user-1');
    expect(mockListAthletes).toHaveBeenCalledWith('s1');
  });

  it('opens the athlete profile with its name when a row is pressed', async () => {
    await show();

    await fireEvent.press(await screen.findByRole('button', { name: /^Lucía Ramírez/ }));

    expect(mockPush).toHaveBeenCalledWith('/athletes/a1?name=Luc%C3%ADa%20Ram%C3%ADrez');
  });

  it('goes back from the back button', async () => {
    await show();

    await fireEvent.press(await screen.findByRole('button', { name: t('common.back') }));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a school admin', 'admin-1'],
    ['a guardian', 'guardian-1'],
  ])('sends %s, who is not a coach, back to the home without reading any athlete', async (_label, userId) => {
    mockUserId = userId;
    mockListCoachSchools.mockResolvedValue([]);
    await show();

    expect(await screen.findByText('redirected to /')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Lucía Ramírez/ })).toBeNull();
    expect(mockListAthletes).not.toHaveBeenCalled();
  });

  // The coach lands here instead of on the home screen, so the entries only the home screen had are here too.
  it.each([
    ['Toma de tiempos', '/timing'],
    ['Toma en serie', '/timing?mode=series'],
    ['Registrar completado', '/timing?mode=completed'],
    ['Planes de entrenamiento', '/plans'],
  ])('gives the coach %s, which opens the route the home screen uses', async (name, href) => {
    await show();

    await fireEvent.press(await screen.findByRole('button', { name }));

    expect(mockPush).toHaveBeenCalledWith(href);
  });

  it('hides the conflict review from a coach who is not a platform admin', async () => {
    await show();

    expect(await screen.findByRole('button', { name: 'Toma de tiempos' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Revisar conflictos' })).toBeNull();
  });

  it('gives the conflict review to a coach who is also a platform admin', async () => {
    mockPlatformAdmin = true;
    await show();

    await fireEvent.press(await screen.findByRole('button', { name: 'Revisar conflictos' }));

    expect(mockPush).toHaveBeenCalledWith('/review-conflicts');
  });

  it('signs the coach out from the sign-out button', async () => {
    await show();

    await fireEvent.press(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it('shows no entry to someone who is not a coach, who leaves the route', async () => {
    mockListCoachSchools.mockResolvedValue([]);
    await show();

    expect(await screen.findByText('redirected to /')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Toma de tiempos' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
  });

  it('shows the loading state, not a redirect, while the role is looked up', async () => {
    mockListCoachSchools.mockReturnValue(new Promise(() => {}));
    await show();

    expect(screen.getByTestId('state-view')).toBeBusy();
    expect(screen.queryByText(/redirected/)).toBeNull();
  });

  it('shows an error with a way to look again, not a redirect, when the role lookup fails', async () => {
    mockListCoachSchools.mockRejectedValueOnce(new Error('db')).mockResolvedValue([{ id: 's1', name: 'Escuela Delfines' }]);
    await show();

    await fireEvent.press(await screen.findByRole('button', { name: t('schoolConsole.screen.retry') }));

    expect(await screen.findByRole('button', { name: /^Lucía Ramírez/ })).toBeOnTheScreen();
    expect(screen.queryByText(/redirected/)).toBeNull();
  });
});
