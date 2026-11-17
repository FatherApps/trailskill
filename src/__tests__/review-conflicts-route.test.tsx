import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ReviewConflictsRoute from '../app/(app)/review-conflicts';
import { ThemeProvider } from '../core/theme';

// Synthetic data only. The in-memory repository stands in for what the backend lets each user read.
const mockConflict = {
  id: 'conflict-1',
  expectedVersion: 3,
  athleteName: 'Mateo C.',
  event: { stroke: 'FR', distance: '50m', pool: 'SCM' },
  current: { hundredths: 3520, author: 'Coach Uno', device: 'Teléfono A', at: new Date(2026, 9, 25, 14, 0).toISOString() },
  incoming: { hundredths: 3480, author: 'Coach Dos', device: 'Teléfono B', at: new Date(2026, 9, 25, 14, 5).toISOString() },
};

let mockUserId: string | undefined;
let mockStaffSchools: unknown[];
const mockAdmins = ['admin-1'];
jest.mock('../core/session', () => ({
  useSession: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}));
jest.mock('../core/sync', () => ({
  supabase: {},
  useGlobalSyncSummary: () => ({ lastSyncedAt: new Date(2026, 9, 24, 11, 55, 0), connected: true, connection: 'connected' }),
}));
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console/data/useAdminSchool'),
  createPowerSyncStaffSchoolRepository: () => ({ listStaffSchools: () => Promise.resolve(mockStaffSchools) }),
}));
jest.mock('../modules/timing', () => ({
  ...jest.requireActual('../modules/timing/screens/ReviewConflictsFlow'),
  // What the backend lets each user read is the backend's job; this fake answers the same list to everyone who reaches it.
  createSupabaseConflictReviewRepository: () => ({
    isPlatformAdmin: (userId: string) => Promise.resolve(mockAdmins.includes(userId)),
    listOpen: () => Promise.resolve([mockConflict]),
    resolve: () => Promise.reject(new Error('not used')),
  }),
}));
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, back: mockBack }) }));

const school = [{ id: 's1', name: 'Escuela Delfines' }];

beforeEach(() => {
  mockUserId = 'user-1';
  mockStaffSchools = school;
  mockReplace.mockReset();
  mockBack.mockReset();
});

const show = () =>
  render(
    <ThemeProvider>
      <ReviewConflictsRoute />
    </ThemeProvider>,
  );

describe('review conflicts route', () => {
  it.each([
    ['a school admin', 'school-admin-1'],
    ['a coach', 'coach-1'],
  ])('shows %s the conflicts read-only, with no way to resolve', async (_label, userId) => {
    mockUserId = userId;
    await show();

    await fireEvent.press(await screen.findByRole('button', { name: /Mateo C\./ }));

    expect(screen.getByText('Versión guardada')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Resolver conflicto' })).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps the resolving controls for a platform admin', async () => {
    mockUserId = 'admin-1';
    await show();

    await fireEvent.press(await screen.findByRole('button', { name: /Mateo C\./ }));

    expect(screen.getByRole('button', { name: 'Resolver conflicto' })).toBeOnTheScreen();
  });

  it.each([
    ['a guardian or an adult athlete with no school', 'guardian-1'],
    ['no session', undefined],
  ])('sends %s home without showing any conflict', async (_label, userId) => {
    mockUserId = userId;
    mockStaffSchools = [];
    await show();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('Mateo C.')).toBeNull();
  });
});
