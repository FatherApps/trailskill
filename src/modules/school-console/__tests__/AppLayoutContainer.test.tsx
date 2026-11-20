import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppLayoutContainer } from '../screens/AppLayoutContainer';

// Avoid loading the native PowerSync database.
jest.mock('../../../core/sync', () => ({ db: {}, useGlobalSyncSummary: () => ({ lastSyncedAt: new Date(0) }) }));
jest.mock('../../../core/session', () => ({
  ...jest.requireActual('../../../core/session'),
  useSession: () => ({ session: { user: { id: 'guardian-1', email: 'guardian@example.com' } } }),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  default: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
}));
jest.mock('../data/useAdminSchool', () => ({
  ...jest.requireActual('../data/useAdminSchool'),
  useStaffSchool: () => ({ status: 'denied' }),
}));
jest.mock('../../athletes', () => ({
  ...jest.requireActual('../../athletes'),
  useManagedAthletes: () => ({ status: 'ready', athletes: [{ id: 'a1' }, { id: 'a2' }] }),
}));
let mockDeletion: { state: string; deleteAfter?: string; refresh: () => void } = { state: 'active', refresh: () => {} };
jest.mock('../../accounts', () => ({
  ...jest.requireActual('../../accounts'),
  useAccountDeletionStatus: () => mockDeletion,
  useOwnLandingEvidence: () => ({ managedCount: 2, selfAthleteId: null, authorized: true }),
  useFinishRegistration: () => null,
  usePendingInvitations: jest.fn(),
  useAcceptCoachInvitations: jest.fn(),
  useProfileGate: () => ({ status: 'ready', recheck: () => {} }),
}));

beforeEach(() => {
  mockDeletion = { state: 'active', refresh: () => {} };
});

// The container takes the router from the route file, so a fake one is enough: no expo-router is loaded.
describe('AppLayoutContainer', () => {
  it('draws the navigator it is given and the phone bar of a guardian over it', async () => {
    const router = { replace: jest.fn(), navigate: jest.fn() };
    await render(<AppLayoutContainer router={router} segments={['(app)', 'home']} stack={<Text>navigator</Text>} />);

    expect(screen.getByText('navigator')).toBeOnTheScreen();
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Deportistas',
      'Inicio',
      'Historial',
      'Marcas',
      'Mis tiempos',
      'Ajustes',
    ]);
  });

  it('shows only the deletion date and the way to cancel for an account marked for deletion, never the app', async () => {
    mockDeletion = { state: 'marked', deleteAfter: '2026-12-20T15:00:00.000Z', refresh: () => {} };
    const router = { replace: jest.fn(), navigate: jest.fn() };
    await render(<AppLayoutContainer router={router} segments={['(app)', 'home']} stack={<Text>navigator</Text>} />);

    expect(screen.getByText('Se borra el 20 de diciembre de 2026')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancelar eliminación' })).toBeOnTheScreen();
    expect(screen.queryByText('navigator')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('draws nothing of the app while it still asks whether the account is marked', async () => {
    mockDeletion = { state: 'loading', refresh: () => {} };
    const router = { replace: jest.fn(), navigate: jest.fn() };
    await render(<AppLayoutContainer router={router} segments={['(app)', 'home']} stack={<Text>navigator</Text>} />);

    expect(screen.queryByText('navigator')).toBeNull();
  });

  it('navigates through the given router when a tab is pressed', async () => {
    const router = { replace: jest.fn(), navigate: jest.fn() };
    await render(<AppLayoutContainer router={router} segments={['(app)', 'home']} stack={null} />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Marcas' }));

    expect(router.navigate).toHaveBeenCalledWith('/marks');
  });

  it('shows no bar on a route that has no tab', async () => {
    const router = { replace: jest.fn(), navigate: jest.fn() };
    await render(<AppLayoutContainer router={router} segments={['(app)', 'athletes', 'add']} stack={null} />);

    expect(screen.queryByRole('tab')).toBeNull();
  });
});
