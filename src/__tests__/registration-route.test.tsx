import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import AppLayout from '../app/(app)/_layout';

// Avoid loading the native PowerSync database and the ESM-only @powersync/react.
jest.mock('../core/sync', () => ({ db: {} }));
jest.mock('@powersync/react', () => ({ PowerSyncContext: { Provider: ({ children }: { children: unknown }) => children } }));
jest.mock('../core/session', () => ({ useSession: () => ({ session: { user: { id: 'user-1', email: 'camila@example.test' } } }) }));

// The layout hands the module a callback; the test calls it as the module would.
let mockOnNext: (step: 'add_athletes' | 'authorizations') => void = () => {};
jest.mock('../modules/accounts', () => ({
  createPowerSyncManagedAthleteProfileRepository: () => ({}),
  createPowerSyncManagedAthleteRepository: () => ({}),
  createSecureStoreRegistrationDraftRepository: () => ({}),
  createSupabaseAdultProfileRepository: () => ({}),
  useFinishRegistration: (...args: unknown[]) => {
    mockOnNext = args[5] as typeof mockOnNext;
  },
}));

const routes = {
  '(app)/_layout': AppLayout,
  '(app)/index': () => <Text>home</Text>,
  '(app)/athletes/add': () => <Text>add</Text>,
  '(app)/athletes/authorizations': () => <Text>authorizations</Text>,
};

describe('registration routing', () => {
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
});
