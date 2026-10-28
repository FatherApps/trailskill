import { fireEvent, render, screen } from '@testing-library/react-native';

import AppLayout from '../app/(app)/_layout';
import { iconPaths } from '../core/ui/icons';

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

// What the device says about the user: a guardian by default, an adult athlete when the only managed athlete is their own.
let mockOwn: 'loading' | { managedCount: number; selfAthleteId: string | null; authorized: boolean } = { managedCount: 2, selfAthleteId: null, authorized: true };
jest.mock('../modules/accounts', () => ({
  ...jest.requireActual('../modules/accounts'),
  useOwnLandingEvidence: () => mockOwn,
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
    mockOwn = { managedCount: 2, selfAthleteId: null, authorized: true };
  });

  const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel);
  const adult = () => {
    mockManaged = [{ id: 'self-1' }];
    mockOwn = { managedCount: 1, selfAthleteId: 'self-1', authorized: true };
  };

  it('shows Inicio, Historial and Deportistas, in that order, to a guardian on a phone', async () => {
    await render(<AppLayout />);

    expect(tabNames()).toEqual(['Inicio', 'Historial', 'Deportistas']);
  });

  const drawn = () => screen.container.queryAll((node) => node.type === 'RNSVGPath').map((path) => path.props.d);

  it('draws the design icons of the guardian bar, in order', async () => {
    await render(<AppLayout />);

    expect(drawn()).toEqual([iconPaths.home, iconPaths.timeline, iconPaths.group]);
  });

  it('draws the design icons of the adult bar, in order', async () => {
    adult();
    await render(<AppLayout />);

    expect(drawn()).toEqual([iconPaths.home, iconPaths.timeline, iconPaths.group]);
  });

  // Until #778 the adult reaches the sign-out and the authorizations, which live in the footer of "Mis deportistas", through this tab.
  it('shows Inicio, Historial and Deportistas to an adult athlete', async () => {
    adult();
    await render(<AppLayout />);

    expect(tabNames()).toEqual(['Inicio', 'Historial', 'Deportistas']);
  });

  it('keeps Deportistas for an adult who also manages other athletes', async () => {
    mockOwn = { managedCount: 2, selfAthleteId: 'self-1', authorized: true };
    await render(<AppLayout />);

    expect(tabNames()).toEqual(['Inicio', 'Historial', 'Deportistas']);
  });

  it('waits for what the device says about the user before it draws the bar', async () => {
    mockOwn = 'loading';
    await render(<AppLayout />);

    expect(screen.queryByRole('tab')).toBeNull();
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
    await render(<AppLayout />);

    expect(screen.getByRole('tab', { name: 'Deportistas' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Inicio' })).not.toBeSelected();
  });

  // "Entreno" has no tab: the day's plan opens from "Lo próximo" on Inicio.
  it('shows no bar on the day plan', async () => {
    mockSegments = ['(app)', 'today'];
    await render(<AppLayout />);

    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('marks Inicio on its own route', async () => {
    mockSegments = ['(app)', 'home'];
    await render(<AppLayout />);

    expect(screen.getByRole('tab', { name: 'Inicio' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Deportistas' })).not.toBeSelected();
  });

  it('opens Inicio from the bar of a guardian and of an adult athlete', async () => {
    await render(<AppLayout />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Inicio' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/home');

    adult();
    await render(<AppLayout />);
    await fireEvent.press(screen.getAllByRole('tab', { name: 'Inicio' }).at(-1)!);
    expect(mockNavigate).toHaveBeenLastCalledWith('/home');
  });

  it('marks Historial on an athlete profile', async () => {
    mockSegments = ['(app)', 'athletes', '[id]'];
    await render(<AppLayout />);

    expect(screen.getByRole('tab', { name: 'Historial' })).toBeSelected();
  });

  it('opens the existing screens', async () => {
    await render(<AppLayout />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Deportistas' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/athletes');
  });

  it('opens the screens of an adult athlete: Inicio, their own profile and Mis deportistas', async () => {
    adult();
    await render(<AppLayout />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Inicio' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/home');

    await fireEvent.press(screen.getByRole('tab', { name: 'Historial' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/athletes/self-1');

    // The footer of that screen, with the authorizations and the sign-out, is tested in my-athletes-route.test.tsx.
    await fireEvent.press(screen.getByRole('tab', { name: 'Deportistas' }));
    expect(mockNavigate).toHaveBeenLastCalledWith('/athletes');
  });

  it('shows the adult athlete no bar on a tablet', async () => {
    adult();
    mockWidth = 768;
    await render(<AppLayout />);

    expect(screen.queryByRole('tab')).toBeNull();
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
