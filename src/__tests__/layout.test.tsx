import { act, renderRouter, screen } from 'expo-router/testing-library';
import { useSyncExternalStore as mockUseSyncExternalStore } from 'react';
import { StatusBar, StyleSheet, Text, useColorScheme } from 'react-native';

import AppLayout from '../app/(app)/_layout';
import AuthLayout from '../app/(auth)/_layout';
import { SessionGate } from '../app/_layout';
import { colors, ThemeProvider } from '../core/theme';

// Avoid loading the native PowerSync database and the ESM-only @powersync/react.
jest.mock('../core/sync', () => ({ db: {}, useGlobalSyncSummary: () => ({ lastSyncedAt: null }) }));
jest.mock('@powersync/react', () => ({ PowerSyncContext: { Provider: ({ children }: { children: unknown }) => children } }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));

// Expiry of the registration draft is the accounts module's job; the root only calls it when the app opens.
const mockDiscardStaleDraft = jest.fn().mockResolvedValue(undefined);
jest.mock('../modules/accounts', () => ({
  ...jest.requireActual('../modules/accounts'),
  discardStaleDraft: () => mockDiscardStaleDraft(),
  // The root only opens the app for a session here; the profile check has its own suite.
  useProfileGate: () => ({ status: 'ready', recheck: () => {} }),
}));

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ default: jest.fn() }));
// expo-router brings its own provider, so insets are mocked to be non-zero on every side.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 8, right: 12 }),
}));

let mockSession: object | null = null;
const mockListeners = new Set<() => void>();
function setSession(next: object | null) {
  mockSession = next;
  mockListeners.forEach((listener) => listener());
}
jest.mock('../core/session', () => ({
  ...jest.requireActual('../core/session'),
  useSession: () => ({
    session: mockUseSyncExternalStore(
      (listener) => {
        mockListeners.add(listener);
        return () => mockListeners.delete(listener);
      },
      () => mockSession,
    ),
  }),
}));

const routes = {
  _layout: SessionGate,
  '(app)/_layout': AppLayout,
  '(app)/index': () => <Text>home</Text>,
  '(auth)/_layout': AuthLayout,
  '(auth)/sign-in': () => <Text>sign-in</Text>,
};

describe('session gate', () => {
  beforeEach(() => mockDiscardStaleDraft.mockClear());

  it('sends a visitor without session to the sign-in screen', async () => {
    setSession(null);
    await renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByText('sign-in')).toBeOnTheScreen();
    expect(screen.queryByText('home')).toBeNull();
  });

  it('opens the app when there is a session', async () => {
    setSession({ user: { id: 'coach-1' } });
    await renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByText('home')).toBeOnTheScreen();
    expect(screen.queryByText('sign-in')).toBeNull();
  });

  it('moves from sign-in to the app as soon as the session appears', async () => {
    setSession(null);
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('sign-in')).toBeOnTheScreen();

    await act(async () => setSession({ user: { id: 'coach-1' } }));

    expect(await screen.findByText('home')).toBeOnTheScreen();
  });

  it('moves back to sign-in when the session ends', async () => {
    setSession({ user: { id: 'coach-1' } });
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('home')).toBeOnTheScreen();

    await act(async () => setSession(null));

    expect(await screen.findByText('sign-in')).toBeOnTheScreen();
  });

  it('drops a registration draft that went stale, once, when the app opens', async () => {
    setSession(null);
    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByText('sign-in');

    expect(mockDiscardStaleDraft).toHaveBeenCalledTimes(1);
  });

  describe('root container', () => {
    beforeEach(() => jest.mocked(useColorScheme).mockReturnValue('light'));

    it('keeps every screen inside the safe area, on the app background', async () => {
      setSession(null);
      await renderRouter(routes, { initialUrl: '/', wrapper: ThemeProvider });
      await screen.findByText('sign-in');

      expect(StyleSheet.flatten(screen.getByTestId('safe-area-root').props.style)).toMatchObject({
        flex: 1,
        backgroundColor: colors.light['surface-0'],
        paddingTop: 24,
        paddingBottom: 16,
        paddingLeft: 8,
        paddingRight: 12,
      });
    });

    it.each([
      ['light', 'dark-content'],
      ['dark', 'light-content'],
    ] as const)('draws the status bar for the %s theme with %s', async (scheme, barStyle) => {
      jest.mocked(useColorScheme).mockReturnValue(scheme);
      const pushed = jest.spyOn(StatusBar, 'pushStackEntry');
      setSession(null);
      await renderRouter(routes, { initialUrl: '/', wrapper: ThemeProvider });
      await screen.findByText('sign-in');

      expect(pushed).toHaveBeenCalledWith(expect.objectContaining({ barStyle }));
      expect(StyleSheet.flatten(screen.getByTestId('safe-area-root').props.style).backgroundColor).toBe(
        colors[scheme]['surface-0'],
      );
      pushed.mockRestore();
    });
  });
});
