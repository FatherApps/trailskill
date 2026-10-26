import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import AppLayout from '../app/(app)/_layout';

// Avoid loading the native PowerSync database and the ESM-only @powersync/react.
jest.mock('../core/sync', () => ({ db: {}, useGlobalSyncSummary: () => ({ lastSyncedAt: null }) }));
jest.mock('@powersync/react', () => ({ PowerSyncContext: { Provider: ({ children }: { children: unknown }) => children } }));
jest.mock('../core/session', () => ({ useSession: () => ({ session: { user: { id: 'user-1', email: 'camila@example.test' } } }) }));

// The layout hands the module a callback; the test calls it as the module would.
let mockOnNext: (step: 'add_athletes' | 'authorizations') => void = () => {};
let mockOffer: { email: string; resume: () => void; startOver: () => void } | undefined;
jest.mock('../modules/accounts', () => ({
  createPowerSyncManagedAthleteProfileRepository: () => ({}),
  createPowerSyncManagedAthleteRepository: () => ({}),
  createSecureStorePendingInvitationRepository: () => ({}),
  createSecureStoreRegistrationDraftRepository: () => ({}),
  createSupabaseAdultProfileRepository: () => ({}),
  createSupabaseInvitationRepository: () => ({}),
  usePendingInvitations: () => {},
  useFinishRegistration: (...args: unknown[]) => {
    mockOnNext = args[5] as typeof mockOnNext;
    return mockOffer;
  },
  ResumeRegistration: ({ email, onResume, onRestart }: { email: string; onResume: () => void; onRestart: () => void }) => {
    const { Text } = jest.requireActual('react-native');
    return (
      <>
        <Text onPress={onResume}>{`resume ${email}`}</Text>
        <Text onPress={onRestart}>restart</Text>
      </>
    );
  },
}));

const routes = {
  '(app)/_layout': AppLayout,
  '(app)/index': () => <Text>home</Text>,
  '(app)/athletes/add': () => <Text>add</Text>,
  '(app)/athletes/authorizations': () => <Text>authorizations</Text>,
};

describe('registration routing', () => {
  beforeEach(() => {
    mockOffer = undefined;
  });

  it.each([
    ['add_athletes', 'add'],
    ['authorizations', 'authorizations'],
  ] as const)('opens the %s step on its own screen', async (step, text) => {
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('home')).toBeOnTheScreen();

    await act(async () => mockOnNext(step));

    expect(await screen.findByText(text)).toBeOnTheScreen();
    expect(screen.queryByText('home')).toBeNull();
  });

  it('offers to resume a draft instead of opening the app, and goes on once it is answered', async () => {
    const offer = { email: 'camila@example.test', resume: jest.fn(), startOver: jest.fn() };
    mockOffer = offer;
    await renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByText('resume camila@example.test')).toBeOnTheScreen();
    expect(screen.queryByText('home')).toBeNull();
    await act(async () => screen.getByText('resume camila@example.test').props.onPress());
    expect(offer.resume).toHaveBeenCalledTimes(1);
    await act(async () => screen.getByText('restart').props.onPress());
    expect(offer.startOver).toHaveBeenCalledTimes(1);
  });
});
