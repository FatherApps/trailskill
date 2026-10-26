import { render } from '@testing-library/react-native';

import AppLayout from '../app/(app)/_layout';
import type { RegistrationStep } from '../modules/accounts';

// Avoid loading the native PowerSync database.
jest.mock('../core/sync', () => ({ db: {}, useGlobalSyncSummary: () => ({ lastSyncedAt: null }) }));
jest.mock('../core/session', () => ({
  ...jest.requireActual('../core/session'),
  useSession: () => ({ session: { user: { id: 'guardian-1', email: 'guardian@example.com' } } }),
}));

// The module-level router is unbound after Android recreates the Activity (expo/expo#51859): only the hook keeps working.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: () => null,
  router: new Proxy({}, { get: () => () => { throw new Error('The imperative router is unavailable before the first render has finished.'); } }),
  useRouter: () => ({ replace: mockReplace }),
}));

let mockOpenNext: ((step: RegistrationStep) => void) | undefined;
jest.mock('../modules/accounts', () => ({
  ...jest.requireActual('../modules/accounts'),
  useFinishRegistration: (...args: unknown[]) => {
    mockOpenNext = args[5] as typeof mockOpenNext;
    return null;
  },
  usePendingInvitations: jest.fn(),
}));

describe('app layout', () => {
  beforeEach(() => mockReplace.mockClear());

  it.each([
    ['add_athletes', '/athletes/add'],
    ['authorizations', '/athletes/authorizations'],
  ] as const)('opens %s through the router hook after registering', async (step, href) => {
    await render(<AppLayout />);

    mockOpenNext!(step);

    expect(mockReplace).toHaveBeenCalledWith(href);
  });
});
