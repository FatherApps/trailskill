import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppLayoutContainer } from '../screens/AppLayoutContainer';

// Issue 1311: the app opens from the phone and the server is asked in the background. The real status hook runs here; only the
// server (a call that never answers, or answers late) and the phone's memory are fakes.
jest.mock('../../../core/sync', () => ({ db: {}, useGlobalSyncSummary: () => ({ lastSyncedAt: new Date(0), connection: 'offline' }) }));
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

const MARKED = '2026-12-20T15:00:00.000Z';
let mockAnswer: ((value: string | null) => void) | undefined;
let mockKnown: ReturnType<typeof import('../../accounts').createInMemoryKnownDeletionStatusRepository>;
jest.mock('../../accounts', () => {
  const actual = jest.requireActual('../../accounts');
  return {
    ...actual,
    // The RPC never answers until a test answers it.
    createSupabaseAccountDeletionRepository: () => ({
      ...actual.createInMemoryAccountDeletionRepository(),
      status: () => new Promise<string | null>((resolve) => (mockAnswer = resolve)),
    }),
    createSecureStoreKnownDeletionStatusRepository: () => ({
      read: (userId: string) => mockKnown.read(userId),
      write: (userId: string, status: never) => mockKnown.write(userId, status),
    }),
    useOwnLandingEvidence: () => ({ managedCount: 2, selfAthleteId: null, authorized: true }),
    useFinishRegistration: () => null,
    usePendingInvitations: jest.fn(),
    useAcceptCoachInvitations: jest.fn(),
    useProfileGate: () => ({ status: 'ready', recheck: () => {} }),
  };
});

const router = { replace: jest.fn(), navigate: jest.fn() };
const renderLayout = () => render(<AppLayoutContainer router={router} segments={['(app)', 'home']} stack={<Text>navigator</Text>} />);

beforeEach(() => {
  mockAnswer = undefined;
  mockKnown = jest.requireActual('../../accounts').createInMemoryKnownDeletionStatusRepository();
});

describe('AppLayoutContainer opens from the phone', () => {
  it('shows the app of an account known to be active while the status call never answers', async () => {
    await mockKnown.write('guardian-1', { state: 'active' });
    await renderLayout();

    expect(await screen.findByText('navigator')).toBeOnTheScreen();
  });

  it('opens an account known to be marked on its grace screen, with no answer from the server', async () => {
    await mockKnown.write('guardian-1', { state: 'marked', deleteAfter: MARKED });
    await renderLayout();

    expect(await screen.findByText('Se borra el 20 de diciembre de 2026')).toBeOnTheScreen();
    expect(screen.queryByText('navigator')).toBeNull();
  });

  it('moves a known active account to the grace screen as soon as the server says it is marked', async () => {
    await mockKnown.write('guardian-1', { state: 'active' });
    await renderLayout();
    expect(await screen.findByText('navigator')).toBeOnTheScreen();

    await act(async () => mockAnswer?.(MARKED));

    expect(await screen.findByText('Se borra el 20 de diciembre de 2026')).toBeOnTheScreen();
    expect(screen.queryByText('navigator')).toBeNull();
  });

  it('draws nothing of the app on a phone that knows nothing about the account until the server answers', async () => {
    await renderLayout();

    expect(screen.queryByText('navigator')).toBeNull();
  });
});
