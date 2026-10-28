import { render, waitFor } from '@testing-library/react-native';

import AuthCallback from '../app/auth-callback';

let mockCanGoBack = true;
let mockParams: { code?: string | string[] } = {};
const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: () => mockCanGoBack };
const mockResume = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('../core/session', () => ({ useSession: () => ({ resumeProviderSignIn: (...args: unknown[]) => mockResume(...args) }) }));

beforeEach(() => {
  mockCanGoBack = true;
  mockParams = {};
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
  mockResume.mockReset().mockResolvedValue(undefined);
});

// trailskill://auth-callback reaches the router when the system browser returns. A sign-in that is waiting reads the
// result itself; when the app was closed meanwhile, this route is the only one that sees the code.
describe('auth-callback route', () => {
  it('goes back to the screen the person was on, so a failure shows where it started', async () => {
    await render(<AuthCallback />);

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('opens the home route when the app was started by the link and there is nothing to go back to', async () => {
    mockCanGoBack = false;

    await render(<AuthCallback />);

    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('hands the code of the link to the session once', async () => {
    mockParams = { code: 'one-time-code' };

    await render(<AuthCallback />);

    await waitFor(() => expect(mockResume).toHaveBeenCalledTimes(1));
    expect(mockResume).toHaveBeenCalledWith('one-time-code');
  });

  it('hands over nothing when the link has no code, as after a provider error', async () => {
    await render(<AuthCallback />);

    expect(mockResume).not.toHaveBeenCalled();
  });

  it('ignores a code that is not a single value', async () => {
    mockParams = { code: ['a', 'b'] };

    await render(<AuthCallback />);

    expect(mockResume).not.toHaveBeenCalled();
  });

  it('does not break when the code cannot be traded: the person stays signed out', async () => {
    mockParams = { code: 'one-time-code' };
    mockResume.mockRejectedValue(new Error('invalid flow state'));

    await render(<AuthCallback />);

    await waitFor(() => expect(mockResume).toHaveBeenCalled());
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
