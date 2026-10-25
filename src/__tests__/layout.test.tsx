import { act, renderRouter, screen } from 'expo-router/testing-library';
import { useSyncExternalStore as mockUseSyncExternalStore } from 'react';
import { Text } from 'react-native';

import AppLayout from '../app/(app)/_layout';
import AuthLayout from '../app/(auth)/_layout';
import { SessionGate } from '../app/_layout';

// Avoid loading the native PowerSync database and the ESM-only @powersync/react.
jest.mock('../core/sync', () => ({ db: {} }));
jest.mock('@powersync/react', () => ({ PowerSyncContext: { Provider: ({ children }: { children: unknown }) => children } }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));

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
});
