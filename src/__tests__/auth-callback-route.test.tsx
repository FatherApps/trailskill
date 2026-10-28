import { render } from '@testing-library/react-native';

import AuthCallback from '../app/auth-callback';

let mockCanGoBack = true;
const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: () => mockCanGoBack };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

beforeEach(() => {
  mockCanGoBack = true;
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
});

// trailskill://auth-callback reaches the router when the system browser returns; the sign-in call already holds the result.
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
});
