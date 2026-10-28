import { fireEvent, render, screen } from '@testing-library/react-native';

import AppLayout from '../app/(app)/_layout';

// Avoid loading the native PowerSync database.
let mockSynced: Date | null = new Date(0);
jest.mock('../core/sync', () => ({ db: {}, useGlobalSyncSummary: () => ({ lastSyncedAt: mockSynced }) }));
jest.mock('../core/session', () => ({
  ...jest.requireActual('../core/session'),
  useSession: () => ({ session: { user: { id: 'guardian-1', email: 'guardian@example.com' } } }),
}));

const mockNavigate = jest.fn();
let mockSegments: string[] = ['(app)', 'athletes'];
jest.mock('expo-router', () => ({
  Stack: () => null,
  useRouter: () => ({ replace: jest.fn(), navigate: mockNavigate }),
  useSegments: () => mockSegments,
}));

let mockWidth = 390;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  default: () => ({ width: mockWidth, height: 844, scale: 1, fontScale: 1 }),
}));

let mockStaff: 'staff' | 'denied' | 'loading' | 'error' = 'denied';
const mockUseStaffSchool = jest.fn(() => ({ status: mockStaff }));
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console'),
  useStaffSchool: () => mockUseStaffSchool(),
}));

let mockManaged: { id: string }[] = [{ id: 'a1' }, { id: 'a2' }];
const mockUseManagedAthletes = jest.fn(() => ({ status: 'ready', athletes: mockManaged }));
jest.mock('../modules/athletes', () => ({
  ...jest.requireActual('../modules/athletes'),
  useManagedAthletes: () => mockUseManagedAthletes(),
}));

jest.mock('../modules/accounts', () => ({
  ...jest.requireActual('../modules/accounts'),
  useFinishRegistration: () => null,
  usePendingInvitations: jest.fn(),
  // This suite is about the app once the account has a profile; the gate has its own suite.
  useProfileGate: () => ({ status: 'ready', recheck: () => {} }),
}));

describe('app layout phone navigation', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockUseStaffSchool.mockClear();
    mockUseManagedAthletes.mockClear();
    mockSegments = ['(app)', 'athletes'];
    mockSynced = new Date(0);
    mockWidth = 390;
    mockStaff = 'denied';
    mockManaged = [{ id: 'a1' }, { id: 'a2' }];
  });

  it('shows the three destinations to a guardian on a phone', async () => {
    await render(<AppLayout />);

    expect(screen.getByRole('tab', { name: 'Deportistas' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Entreno' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Historial' })).toBeOnTheScreen();
  });

  it('keeps the bar when the staff lookup failed, as before the failure had a status of its own', async () => {
    mockStaff = 'error';
    await render(<AppLayout />);

    expect(screen.getByRole('tab', { name: 'Deportistas' })).toBeOnTheScreen();
  });

  it.each([
    ['school staff', 'staff', 390],
    ['a lookup that has not answered', 'loading', 390],
    ['a tablet', 'denied', 768],
  ] as const)('shows no bar to %s', async (_label, staff, width) => {
    mockStaff = staff;
    mockWidth = width;
    await render(<AppLayout />);

    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('shows no bar before the first sync, when staff memberships may not have arrived', async () => {
    mockSynced = null;
    await render(<AppLayout />);

    expect(screen.queryByRole('tab')).toBeNull();
  });

  it.each([
    ['the athletes registration', ['(app)', 'athletes', 'add']],
    ['the authorizations step', ['(app)', 'athletes', 'authorizations']],
    ['a static route added later under /athletes', ['(app)', 'athletes', 'some-new-route']],
    ['the school console', ['(app)', 'console']],
    ['the timing', ['(app)', 'timing']],
  ])('shows no bar on %s', async (_label, segments) => {
    mockSegments = segments;
    await render(<AppLayout />);

    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('runs no lookup for the bar on a tablet or outside its destinations', async () => {
    mockWidth = 768;
    await render(<AppLayout />);
    expect(mockUseStaffSchool).not.toHaveBeenCalled();
    expect(mockUseManagedAthletes).not.toHaveBeenCalled();

    mockWidth = 390;
    mockSegments = ['(app)', 'athletes', 'add'];
    await render(<AppLayout />);
    expect(mockUseStaffSchool).not.toHaveBeenCalled();
    expect(mockUseManagedAthletes).not.toHaveBeenCalled();
  });

  it('marks the destination of the current route as selected', async () => {
    mockSegments = ['(app)', 'today'];
    await render(<AppLayout />);

    expect(screen.getByRole('tab', { name: 'Entreno' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Deportistas' })).not.toBeSelected();
  });

  it('marks Historial on an athlete profile', async () => {
    mockSegments = ['(app)', 'athletes', '[id]'];
    await render(<AppLayout />);

    expect(screen.getByRole('tab', { name: 'Historial' })).toBeSelected();
  });

  it('opens the existing screens', async () => {
    await render(<AppLayout />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Entreno' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/today');

    await fireEvent.press(screen.getByRole('tab', { name: 'Deportistas' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/athletes');
  });

  it('opens the profile of the only athlete from Historial', async () => {
    mockManaged = [{ id: 'a1' }];
    await render(<AppLayout />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Historial' }));

    expect(mockNavigate).toHaveBeenCalledWith('/athletes/a1');
  });

  it('asks which athlete from Historial when there are several', async () => {
    await render(<AppLayout />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Historial' }));

    expect(mockNavigate).toHaveBeenCalledWith('/athletes');
  });
});
