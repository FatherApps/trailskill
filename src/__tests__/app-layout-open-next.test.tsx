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
const mockRouter = { replace: mockReplace };
jest.mock('expo-router', () => ({
  Stack: () => null,
  useSegments: () => ['(app)'],
  router: new Proxy({}, { get: () => () => { throw new Error('The imperative router is unavailable before the first render has finished.'); } }),
  useRouter: () => mockRouter,
}));

let mockOpenNext: ((step: RegistrationStep) => void) | undefined;
const mockFinishRuns = jest.fn();
jest.mock('../modules/accounts', () => ({
  ...jest.requireActual('../modules/accounts'),
  // Like the real hook, it finishes the registration again whenever onNext changes.
  useFinishRegistration: (...args: unknown[]) => {
    const onNext = args[5] as typeof mockOpenNext;
    mockOpenNext = onNext;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => mockFinishRuns(), [onNext]);
    return null;
  },
  usePendingInvitations: jest.fn(),
}));

describe('app layout', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockFinishRuns.mockClear();
  });

  it('finishes the registration once however many times it renders', async () => {
    const view = await render(<AppLayout />);
    await view.rerender(<AppLayout />);
    await view.rerender(<AppLayout />);

    expect(mockFinishRuns).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['add_athletes', '/athletes/add'],
    ['authorizations', '/athletes/authorizations'],
  ] as const)('opens %s through the router hook after registering', async (step, href) => {
    await render(<AppLayout />);

    mockOpenNext!(step);

    expect(mockReplace).toHaveBeenCalledWith(href);
  });
});
