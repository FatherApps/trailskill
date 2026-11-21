import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { db, SupabaseConnector } from '../../sync';
import { CodeMismatchError, LOCAL_STEP_TIMEOUT_MS, SessionProvider, signOutDecision, useSession } from '../SessionProvider';

const mockCalls: string[] = [];
let mockUnsent: Promise<number>;
let mockRejected = 0;
let mockOwnerWriteError: Error | undefined;
let mockConnect: () => Promise<unknown>;
let mockConfigError: string | null = null;
let mockInitialSession: unknown;
let mockAuthCallback: (event: string, session: unknown) => void = () => {};
// The user whose data the local database holds, as stored on the device.
let mockOwner: string | null;
let mockOwnerError: Error | undefined;
let mockClearError: Error | undefined;
// The local database never answers: clearing it neither succeeds nor fails.
let mockClearHangs = false;
// The next clear waits on this promise (once): it can end late, successfully or not.
let mockClearGate: Promise<void> | undefined;
// The stored session is never read: supabase-js never delivers INITIAL_SESSION.
let mockRestoreHangs = false;
const mockSignedIn = { access_token: 'token', user: { id: 'coach-1' } };
const mockSetSessionUser = jest.fn();
const mockSignInWithOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockSignOut = jest.fn();
const mockGetSession = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockExchangeCode = jest.fn();
const mockOpenAuthSession = jest.fn();

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
}));

// The real createURL and parse read the Expo manifest, which does not exist under Jest.
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `swimcro://${path}`,
  parse: (url: string) => ({ queryParams: Object.fromEntries(new URL(url).searchParams) }),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => {
    if (mockOwnerError) throw mockOwnerError;
    return mockOwner;
  },
  setItemAsync: async (_key: string, value: string) => {
    if (mockOwnerWriteError) throw mockOwnerWriteError;
    mockCalls.push(`owner=${value}`);
    mockOwner = value;
  },
}));

jest.mock('../../sync', () => ({
  setSessionUser: (userId: string | undefined) => mockSetSessionUser(userId),
  countUnsentRecords: async () => ({ unsent: await mockUnsent, rejected: mockRejected }),
  get supabaseConfigError() {
    return mockConfigError;
  },
  SupabaseConnector: jest.fn(() => ({ cancelWaits: () => mockCalls.push('connector.cancelWaits') })),
  connectOptions: { connectionMethod: 'web-socket' },
  db: {
    connect: jest.fn(() => mockConnect()),
    disconnect: jest.fn(async () => mockCalls.push('db.disconnect')),
    disconnectAndClear: jest.fn(async () => {
      if (mockClearHangs) return new Promise<void>(() => {});
      if (mockClearGate) {
        const gate = mockClearGate;
        mockClearGate = undefined;
        mockCalls.push('db.disconnectAndClear:started');
        return gate;
      }
      if (mockClearError) throw mockClearError;
      mockCalls.push('db.disconnectAndClear');
      mockUnsent = Promise.resolve(0);
    }),
  },
  supabase: {
    auth: {
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        mockAuthCallback = callback;
        if (!mockRestoreHangs) callback('INITIAL_SESSION', mockInitialSession);
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCode(...args),
      getSession: () => mockGetSession(),
    },
  },
}));

beforeEach(() => {
  (SupabaseConnector as unknown as jest.Mock).mockClear();
  mockCalls.length = 0;
  mockConfigError = null;
  mockInitialSession = mockSignedIn;
  mockOwner = 'coach-1';
  mockOwnerError = undefined;
  mockClearError = undefined;
  mockClearHangs = false;
  mockClearGate = undefined;
  mockRestoreHangs = false;
  mockUnsent = Promise.resolve(0);
  mockRejected = 0;
  mockOwnerWriteError = undefined;
  mockConnect = async () => mockCalls.push('db.connect');
  mockSignInWithOtp.mockReset().mockResolvedValue({ error: null });
  mockVerifyOtp.mockReset().mockResolvedValue({ error: null });
  mockSignOut.mockReset().mockImplementation(async () => {
    mockCalls.push('auth.signOut');
    return { error: null };
  });
  mockGetSession.mockReset().mockResolvedValue({ data: { session: null } });
  mockSignInWithOAuth.mockReset().mockResolvedValue({ data: { url: 'https://provider.example.test/authorize' }, error: null });
  mockExchangeCode.mockReset().mockResolvedValue({ data: { session: mockSignedIn }, error: null });
  mockOpenAuthSession
    .mockReset()
    .mockResolvedValue({ type: 'success', url: 'swimcro://auth-callback?code=one-time-code' });
});

async function renderSession() {
  const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
  // The provider renders nothing until it knows whose data the local database holds.
  await waitFor(() => expect(result.current).toBeTruthy());
  return result;
}

function Probe() {
  const { session } = useSession();
  return <Text>{session ? 'signed-in' : 'signed-out'}</Text>;
}

async function renderProbe() {
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
}

// The app as the person sees it: the screen they are on, and a way to sign out.
function SignOutProbe() {
  const { session, signOut } = useSession();
  return (
    <>
      <Text>{session ? `signed-in:${session.user.id}` : 'signed-out'}</Text>
      <Text
        onPress={() => {
          // Not returned: the press would wait for a sign-out that may never end.
          signOut().catch(() => {});
        }}
      >
        Cerrar sesión de prueba
      </Text>
    </>
  );
}

async function renderApp() {
  await render(
    <SessionProvider>
      <SignOutProbe />
    </SessionProvider>,
  );
  await screen.findByText('signed-in:coach-1');
}

// Lets the sign-out reach the clear it waits on, so the time limit that follows counts from there.
async function pressSignOut() {
  await fireEvent.press(screen.getByText('Cerrar sesión de prueba'));
  await act(async () => {});
}

describe('signInWithProvider', () => {
  const redirectTo = 'swimcro://auth-callback';

  it('opens the provider in the system browser, then trades the returned code for the session', async () => {
    const session = await renderSession();

    await expect(session.current.signInWithProvider('google')).resolves.toBe('signed_in');

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
    expect(mockOpenAuthSession).toHaveBeenCalledWith('https://provider.example.test/authorize', redirectTo);
    expect(mockExchangeCode).toHaveBeenCalledWith('one-time-code');
  });

  it('asks Microsoft for the email scope, which its accounts do not share by default', async () => {
    const session = await renderSession();

    await expect(session.current.signInWithProvider('azure')).resolves.toBe('signed_in');

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'azure',
      options: { redirectTo, skipBrowserRedirect: true, scopes: 'email' },
    });
  });

  it.each(['cancel', 'dismiss', 'locked'])('returns cancelled, with no error, when the browser ends as %s', async (type) => {
    mockOpenAuthSession.mockResolvedValue({ type });
    const session = await renderSession();

    await expect(session.current.signInWithProvider('google')).resolves.toBe('cancelled');

    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it('returns cancelled when the person declines on the provider consent screen', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'success', url: `${redirectTo}?error=access_denied&error_description=denied` });
    const session = await renderSession();

    await expect(session.current.signInWithProvider('google')).resolves.toBe('cancelled');

    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it('rejects when the provider returns another error, without trading anything', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'success', url: `${redirectTo}?error=server_error&error_description=boom` });
    const session = await renderSession();

    await expect(session.current.signInWithProvider('azure')).rejects.toThrow('boom');

    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it('rejects when the browser comes back without a code', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'success', url: redirectTo });
    const session = await renderSession();

    await expect(session.current.signInWithProvider('google')).rejects.toThrow('code');

    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it('rejects with the Supabase error when the code cannot be traded', async () => {
    const failure = new Error('invalid flow state');
    mockExchangeCode.mockResolvedValue({ data: { session: null }, error: failure });
    const session = await renderSession();

    await expect(session.current.signInWithProvider('google')).rejects.toBe(failure);
  });

  it('rejects with the Supabase error when the sign-in cannot start, without opening the browser', async () => {
    const failure = new Error('provider is not enabled');
    mockSignInWithOAuth.mockResolvedValue({ data: { url: null }, error: failure });
    const session = await renderSession();

    await expect(session.current.signInWithProvider('google')).rejects.toBe(failure);

    expect(mockOpenAuthSession).not.toHaveBeenCalled();
  });

  it('rejects at once, without calling Supabase, when the build has no server settings', async () => {
    mockConfigError = 'Missing EXPO_PUBLIC_SUPABASE_URL';
    const session = await renderSession();

    await expect(session.current.signInWithProvider('google')).rejects.toThrow('Missing EXPO_PUBLIC_SUPABASE_URL');

    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
  });

  it('lands on the same connected session as the emailed code once Supabase announces it', async () => {
    mockInitialSession = null;
    const session = await renderSession();
    expect(session.current.session).toBeNull();

    await act(async () => {
      await session.current.signInWithProvider('google');
      mockAuthCallback('SIGNED_IN', mockSignedIn);
    });

    await waitFor(() => expect(session.current.session).toBe(mockSignedIn));
    expect(mockCalls).toContain('db.connect');
  });
});

// Android can close the app while the system browser is open: the link then starts the app on its own and no
// signInWithProvider call is waiting. The PKCE verifier is in the session storage, so the code can still be traded.
describe('resumeProviderSignIn', () => {
  afterEach(() => jest.restoreAllMocks());

  it('trades the code of a link that opened the app on its own', async () => {
    const session = await renderSession();

    await session.current.resumeProviderSignIn('cold-start-code');

    expect(mockExchangeCode).toHaveBeenCalledTimes(1);
    expect(mockExchangeCode).toHaveBeenCalledWith('cold-start-code');
  });

  it('leaves the code to the sign-in that is waiting for it, so it is traded once', async () => {
    let finishBrowser: (result: unknown) => void = () => {};
    mockOpenAuthSession.mockReturnValue(new Promise((resolve) => (finishBrowser = resolve)));
    const session = await renderSession();
    const waiting = session.current.signInWithProvider('google');

    // The link reaches the router before the browser call returns.
    await session.current.resumeProviderSignIn('one-time-code');
    expect(mockExchangeCode).not.toHaveBeenCalled();
    finishBrowser({ type: 'success', url: 'swimcro://auth-callback?code=one-time-code' });

    await expect(waiting).resolves.toBe('signed_in');
    expect(mockExchangeCode).toHaveBeenCalledTimes(1);
  });

  it('trades the code that arrived while a sign-in waited, once that sign-in ends without trading it', async () => {
    let finishBrowser: (result: unknown) => void = () => {};
    mockOpenAuthSession.mockReturnValue(new Promise((resolve) => (finishBrowser = resolve)));
    const session = await renderSession();
    const waiting = session.current.signInWithProvider('google');

    // The link reached the router, then the browser ended as dismissed: the sign-in never saw the code.
    await session.current.resumeProviderSignIn('late-code');
    expect(mockExchangeCode).not.toHaveBeenCalled();
    finishBrowser({ type: 'dismiss' });

    await expect(waiting).resolves.toBe('cancelled');
    await waitFor(() => expect(mockExchangeCode).toHaveBeenCalledWith('late-code'));
    expect(mockExchangeCode).toHaveBeenCalledTimes(1);
  });

  it('keeps the code waiting while another sign-in still waits, as after a second press', async () => {
    const finishBrowser: ((result: unknown) => void)[] = [];
    mockOpenAuthSession.mockImplementation(() => new Promise((resolve) => finishBrowser.push(resolve)));
    const session = await renderSession();
    const first = session.current.signInWithProvider('google');
    const second = session.current.signInWithProvider('azure');
    await waitFor(() => expect(finishBrowser).toHaveLength(2));

    // The first one ends while the second still waits for the browser.
    finishBrowser[0]({ type: 'cancel' });
    await expect(first).resolves.toBe('cancelled');
    await session.current.resumeProviderSignIn('shared-code');
    expect(mockExchangeCode).not.toHaveBeenCalled();
    finishBrowser[1]({ type: 'success', url: 'swimcro://auth-callback?code=shared-code' });

    await expect(second).resolves.toBe('signed_in');
    expect(mockExchangeCode).toHaveBeenCalledTimes(1);
  });

  it('lets a code be traded again after its trade failed, but not after it worked', async () => {
    mockExchangeCode
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ data: { session: null }, error: new Error('flow state not found') });
    const session = await renderSession();

    await expect(session.current.resumeProviderSignIn('retry-code')).rejects.toThrow('network down');
    await expect(session.current.resumeProviderSignIn('retry-code')).rejects.toThrow('flow state not found');
    await session.current.resumeProviderSignIn('retry-code');
    await session.current.resumeProviderSignIn('retry-code');

    expect(mockExchangeCode).toHaveBeenCalledTimes(3);
  });

  it('logs a failed trade of the waiting code only in development, without the code or the email', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockExchangeCode.mockResolvedValue({
      data: { session: null },
      error: Object.assign(new Error('bad flow state for late-code ana@example.test'), { name: 'AuthApiError', code: 'flow_state_not_found', status: 400 }),
    });
    let finishBrowser: (result: unknown) => void = () => {};
    mockOpenAuthSession.mockReturnValue(new Promise((resolve) => (finishBrowser = resolve)));
    const session = await renderSession();
    const waiting = session.current.signInWithProvider('google');
    await session.current.resumeProviderSignIn('late-code');
    finishBrowser({ type: 'dismiss' });
    await waiting;

    await waitFor(() => expect(logged).toHaveBeenCalledTimes(1));
    const output = JSON.stringify(logged.mock.calls);
    expect(output).toContain('flow_state_not_found');
    expect(output).not.toContain('late-code');
    expect(output).not.toContain('example.test');
  });

  it('does not trade a code a sign-in already traded', async () => {
    const session = await renderSession();
    await session.current.signInWithProvider('google');

    await session.current.resumeProviderSignIn('one-time-code');

    expect(mockExchangeCode).toHaveBeenCalledTimes(1);
  });

  it('trades the code of a later link after the sign-in that was waiting has ended', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });
    const session = await renderSession();
    await session.current.signInWithProvider('google');

    await session.current.resumeProviderSignIn('cold-start-code');

    expect(mockExchangeCode).toHaveBeenCalledWith('cold-start-code');
  });

  it('rejects with the Supabase error when the code cannot be traded', async () => {
    const failure = new Error('invalid flow state');
    mockExchangeCode.mockResolvedValue({ data: { session: null }, error: failure });
    const session = await renderSession();

    await expect(session.current.resumeProviderSignIn('cold-start-code')).rejects.toBe(failure);
  });

  it('rejects at once, without calling Supabase, when the build has no server settings', async () => {
    mockConfigError = 'Missing EXPO_PUBLIC_SUPABASE_URL';
    const session = await renderSession();

    await expect(session.current.resumeProviderSignIn('cold-start-code')).rejects.toThrow('Missing EXPO_PUBLIC_SUPABASE_URL');

    expect(mockExchangeCode).not.toHaveBeenCalled();
  });
});

describe('signOutDecision', () => {
  it.each([
    [0, false, 'proceed'],
    [3, false, 'blocked_pending'],
    [3, true, 'proceed'],
  ] as const)('with %i unsent records and force %p decides %s', (pending, force, decision) => {
    expect(signOutDecision(pending, force)).toBe(decision);
  });
});

describe('useSession', () => {
  it('connects the local database once a session exists', async () => {
    const session = await renderSession();

    expect(session.current.session).toBe(mockSignedIn);
    expect(mockCalls).toEqual(['db.connect']);
    expect(SupabaseConnector).toHaveBeenCalledTimes(1);
  });

  it('tells the local writes who is signed in on every change of session', async () => {
    mockSetSessionUser.mockClear();
    await renderSession();
    expect(mockSetSessionUser).toHaveBeenLastCalledWith('coach-1');

    await act(async () => mockAuthCallback('SIGNED_OUT', null));
    expect(mockSetSessionUser).toHaveBeenLastCalledWith(undefined);

    await act(async () => mockAuthCallback('SIGNED_IN', { access_token: 'token', user: { id: 'coach-2' } }));
    expect(mockSetSessionUser).toHaveBeenLastCalledWith('coach-2');
  });

  it('connects with the sync connection options of the build', async () => {
    await renderSession();

    expect(jest.mocked(db.connect)).toHaveBeenCalledWith(expect.anything(), { connectionMethod: 'web-socket' });
  });

  it('flags a failed sync connection instead of leaving an unhandled rejection, and logs it in development', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('unreachable');
    mockConnect = () => Promise.reject(error);
    const session = await renderSession();

    await waitFor(() => expect(session.current.syncConnectFailed).toBe(true));
    expect(warn).toHaveBeenCalledWith(expect.any(String), error);
    warn.mockRestore();
  });

  it('does not flag the sync connection when it succeeds', async () => {
    const session = await renderSession();

    expect(session.current.syncConnectFailed).toBe(false);
  });

  it('requests a code without creating accounts', async () => {
    const session = await renderSession();

    await session.current.requestCode('ana@example.com');

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      options: { shouldCreateUser: false },
    });
  });

  it('creates the account only when registration asks for it', async () => {
    const session = await renderSession();

    await session.current.requestCode('ana@example.com', { createUser: true });

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      options: { shouldCreateUser: true },
    });
  });

  it('rejects requestCode with the Supabase error', async () => {
    const failure = { code: 'over_email_send_rate_limit', message: 'slow down' };
    mockSignInWithOtp.mockResolvedValue({ error: failure });
    const session = await renderSession();

    await expect(session.current.requestCode('ana@example.com')).rejects.toBe(failure);
  });

  it('verifies the emailed code', async () => {
    const session = await renderSession();

    await session.current.verifyCode('ana@example.com', '123456');

    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: 'ana@example.com', token: '123456', type: 'email' });
  });

  it('turns a wrong or expired code into CodeMismatchError', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { code: 'otp_expired', message: 'Token has expired or is invalid' } });
    const session = await renderSession();

    await expect(session.current.verifyCode('ana@example.com', '000000')).rejects.toBeInstanceOf(CodeMismatchError);
  });

  it('rethrows any other verification error as is', async () => {
    const failure = { code: 'unexpected_failure', message: 'boom' };
    mockVerifyOtp.mockResolvedValue({ error: failure });
    const session = await renderSession();

    await expect(session.current.verifyCode('ana@example.com', '123456')).rejects.toBe(failure);
  });
});

describe('useSession without server configuration', () => {
  beforeEach(() => {
    mockConfigError = 'Missing EXPO_PUBLIC_SUPABASE_URL';
  });

  it('exposes the configuration error', async () => {
    const session = await renderSession();

    expect(session.current.configError).toBe('Missing EXPO_PUBLIC_SUPABASE_URL');
  });

  it('has no configuration error when configured', async () => {
    mockConfigError = null;
    const session = await renderSession();

    expect(session.current.configError).toBeNull();
  });

  it('rejects requestCode at once without calling Supabase', async () => {
    const session = await renderSession();

    await expect(session.current.requestCode('ana@example.com')).rejects.toThrow('Missing EXPO_PUBLIC_SUPABASE_URL');
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('rejects verifyCode at once without calling Supabase', async () => {
    const session = await renderSession();

    await expect(session.current.verifyCode('ana@example.com', '123456')).rejects.toThrow(
      'Missing EXPO_PUBLIC_SUPABASE_URL',
    );
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('does not connect the local database even with a stored session', async () => {
    await renderSession();

    expect(mockCalls).toEqual([]);
  });
});

describe('signOut', () => {
  it('with force clears the local database before ending the session', async () => {
    mockUnsent = Promise.resolve(3);
    const session = await renderSession();
    mockCalls.length = 0;

    let outcome: unknown;
    await act(async () => {
      outcome = await session.current.signOut({ force: true });
    });

    expect(outcome).toEqual({ status: 'signed_out' });
    expect(mockCalls).toEqual(['connector.cancelWaits', 'db.disconnectAndClear', 'auth.signOut']);
  });

  it('without force and with unsent records keeps the session and the local data', async () => {
    mockUnsent = Promise.resolve(3);
    const session = await renderSession();
    mockCalls.length = 0;

    let outcome: unknown;
    await act(async () => {
      outcome = await session.current.signOut();
    });

    expect(outcome).toEqual({ status: 'blocked_pending', unsent: 3, rejected: 0 });
    expect(mockCalls).toEqual([]);
  });

  it('without unsent records signs out', async () => {
    const session = await renderSession();
    mockCalls.length = 0;

    let outcome: unknown;
    await act(async () => {
      outcome = await session.current.signOut();
    });

    expect(outcome).toEqual({ status: 'signed_out' });
    expect(mockCalls).toEqual(['connector.cancelWaits', 'db.disconnectAndClear', 'auth.signOut']);
  });

  it('waits for the unsent count to load instead of deciding on a placeholder', async () => {
    let resolveCount: (count: number) => void = () => {};
    mockUnsent = new Promise((resolve) => (resolveCount = resolve));
    const session = await renderSession();
    mockCalls.length = 0;

    let outcome: Promise<unknown> | undefined;
    await act(async () => {
      outcome = session.current.signOut();
    });
    expect(mockCalls).toEqual([]);

    await act(async () => resolveCount(3));

    expect(await outcome).toEqual({ status: 'blocked_pending', unsent: 3, rejected: 0 });
    expect(mockCalls).toEqual([]);
  });

  it('reports a failed sign-out when the session is still stored', async () => {
    const failure = new Error('storage');
    mockSignOut.mockResolvedValue({ error: failure });
    mockGetSession.mockResolvedValue({ data: { session: mockSignedIn } });
    const session = await renderSession();
    mockCalls.length = 0;

    await act(async () => {
      await expect(session.current.signOut({ force: true })).rejects.toBe(failure);
    });

    expect(mockCalls).toEqual(['connector.cancelWaits', 'db.disconnectAndClear']);
  });

  it('still signs out offline once supabase-js dropped the stored session', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('offline') });
    const session = await renderSession();

    let outcome: unknown;
    await act(async () => {
      outcome = await session.current.signOut({ force: true });
    });

    expect(outcome).toEqual({ status: 'signed_out' });
  });
});

describe('local data on a shared phone', () => {
  it('shows no local data while the session is expired', async () => {
    mockInitialSession = null;
    const session = await renderSession();

    expect(session.current.session).toBeNull();
    expect(mockCalls).toEqual([]);
  });

  it('disconnects without clearing when the session ends without signing out', async () => {
    const session = await renderSession();
    mockCalls.length = 0;

    await act(async () => mockAuthCallback('SIGNED_OUT', null));

    expect(session.current.session).toBeNull();
    expect(mockCalls).toEqual(['connector.cancelWaits', 'db.disconnect']);
  });

  it('gives the same person back their data and unsent records', async () => {
    mockUnsent = Promise.resolve(3);
    const session = await renderSession();

    expect(session.current.session).toBe(mockSignedIn);
    expect(mockCalls).toEqual(['db.connect']);
  });

  it('clears the data of another person with nothing unsent before connecting', async () => {
    mockOwner = 'coach-0';
    const session = await renderSession();

    expect(session.current.session).toBe(mockSignedIn);
    expect(mockCalls).toEqual(['connector.cancelWaits', 'db.disconnectAndClear', 'owner=coach-1', 'db.connect']);
  });

  it('clears the data of an unknown owner with nothing unsent before connecting a new sign-in', async () => {
    mockOwner = null;
    mockInitialSession = null;
    await renderProbe();

    await act(async () => mockAuthCallback('SIGNED_IN', mockSignedIn));

    expect(await screen.findByText('signed-in')).toBeOnTheScreen();
    expect(mockCalls).toEqual(['connector.cancelWaits', 'db.disconnectAndClear', 'owner=coach-1', 'db.connect']);
  });

  it('warns about the unsent records of another person and shows none of their data', async () => {
    mockOwner = 'coach-0';
    mockUnsent = Promise.resolve(3);
    await renderProbe();

    expect(await screen.findByRole('header', { name: '¿Descartar los registros de la persona anterior?' })).toBeOnTheScreen();
    expect(screen.getByText('signed-out')).toBeOnTheScreen();
    expect(mockCalls).toEqual([]);
  });

  it('discarding clears the local database before connecting the new person', async () => {
    mockOwner = 'coach-0';
    mockUnsent = Promise.resolve(3);
    await renderProbe();

    await fireEvent.press(await screen.findByRole('button', { name: 'Descartar registros' }));

    expect(await screen.findByText('signed-in')).toBeOnTheScreen();
    expect(mockCalls).toEqual([
      'connector.cancelWaits',
      'db.disconnectAndClear',
      'owner=coach-1',
      'connector.cancelWaits',
      'db.disconnect',
      'db.connect',
    ]);
  });

  it('going back to the previous person ends only the new session and keeps the data', async () => {
    mockOwner = 'coach-0';
    mockUnsent = Promise.resolve(3);
    await renderProbe();

    await fireEvent.press(await screen.findByRole('button', { name: 'Ingresar como la persona anterior' }));

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mockCalls).toEqual(['auth.signOut']);
    expect(mockOwner).toBe('coach-0');
  });

  it('does not warn again once the records of the previous person are gone', async () => {
    mockOwner = 'coach-0';
    mockUnsent = Promise.resolve(3);
    await renderProbe();
    await screen.findByRole('button', { name: 'Ingresar como la persona anterior' });

    await act(async () => mockAuthCallback('SIGNED_OUT', null));
    mockUnsent = Promise.resolve(0);
    await act(async () => mockAuthCallback('SIGNED_IN', mockSignedIn));

    expect(await screen.findByText('signed-in')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: '¿Descartar los registros de la persona anterior?' })).toBeNull();
  });

  it('adopts a session restored at launch as the owner of local data stored before owners were recorded', async () => {
    mockOwner = null;
    mockUnsent = Promise.resolve(3);
    const session = await renderSession();

    expect(session.current.session).toBe(mockSignedIn);
    expect(mockCalls).toEqual(['owner=coach-1', 'db.connect']);
  });

  it('warns a new sign-in about unsent records of an unknown owner', async () => {
    mockOwner = null;
    mockUnsent = Promise.resolve(3);
    mockInitialSession = null;
    await renderProbe();

    await act(async () => mockAuthCallback('SIGNED_IN', mockSignedIn));

    expect(await screen.findByRole('header', { name: '¿Descartar los registros de la persona anterior?' })).toBeOnTheScreen();
    expect(screen.getByText('signed-out')).toBeOnTheScreen();
    expect(mockCalls).toEqual([]);
  });

  it('shows an error with a retry when the owner of the local data cannot be read', async () => {
    mockOwnerError = new Error('keystore unavailable');
    await renderProbe();

    expect(await screen.findByText('No pudimos abrir los datos del teléfono')).toBeOnTheScreen();
    expect(screen.queryByText('signed-in')).toBeNull();
    expect(mockCalls).toEqual([]);

    mockOwnerError = undefined;
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByText('signed-in')).toBeOnTheScreen();
    expect(mockCalls).toEqual(['connector.cancelWaits', 'db.disconnect', 'db.connect']);
  });

  it('says in the sheet that discarding failed and keeps both choices', async () => {
    mockOwner = 'coach-0';
    mockUnsent = Promise.resolve(3);
    mockClearError = new Error('disk full');
    await renderProbe();

    await fireEvent.press(await screen.findByRole('button', { name: 'Descartar registros' }));

    expect(await screen.findByText(/No pudimos descartar los registros/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ingresar como la persona anterior' })).toBeOnTheScreen();
    expect(screen.getByText('signed-out')).toBeOnTheScreen();
    expect(mockOwner).toBe('coach-0');
  });

  it('lets the person sign out from the error, keeping the local data', async () => {
    mockOwnerError = new Error('keystore unavailable');
    await renderProbe();

    await fireEvent.press(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mockCalls).toEqual(['auth.signOut']);
  });

  it('does not say the records are still there when they were cleared but the new owner was not saved', async () => {
    mockOwner = 'coach-0';
    mockUnsent = Promise.resolve(3);
    mockOwnerWriteError = new Error('keystore unavailable');
    await renderProbe();

    await fireEvent.press(await screen.findByRole('button', { name: 'Descartar registros' }));

    expect(await screen.findByText(/ya se descartaron/)).toBeOnTheScreen();
    expect(screen.queryByText(/Siguen en el teléfono/)).toBeNull();
  });

  // The sheet after a discard that cleared the database but could not save the new owner.
  async function renderIncompleteDiscard() {
    mockOwner = 'coach-0';
    mockUnsent = Promise.resolve(3);
    mockOwnerWriteError = new Error('keystore unavailable');
    await renderProbe();
    await fireEvent.press(await screen.findByRole('button', { name: 'Descartar registros' }));
    await screen.findByText(/ya se descartaron/);
  }

  it('keeps saying the records were discarded when a later attempt fails before clearing', async () => {
    await renderIncompleteDiscard();
    jest.mocked(db.disconnectAndClear).mockClear();
    mockOwnerWriteError = undefined;
    mockClearError = new Error('disk full');

    // The button label changes once the discard is incomplete: either label retries.
    await fireEvent.press(screen.getByRole('button', { name: /Descartar registros|Intentar de nuevo/ }));

    await waitFor(() => expect(db.disconnectAndClear).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/ya se descartaron/)).toBeOnTheScreen();
    expect(screen.queryByText(/Siguen en el teléfono/)).toBeNull();
  });

  it('offers to finish discarding or sign out, not the previous person, once the records are gone', async () => {
    await renderIncompleteDiscard();

    expect(screen.getByRole('header', { name: '¿Terminar de descartar?' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ingresar como la persona anterior' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('finishes discarding from the incomplete sheet', async () => {
    await renderIncompleteDiscard();
    mockOwnerWriteError = undefined;

    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByText('signed-in')).toBeOnTheScreen();
    expect(mockOwner).toBe('coach-1');
  });
});

describe('a local database that does not answer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const giveUp = () => act(async () => void jest.advanceTimersByTime(LOCAL_STEP_TIMEOUT_MS + 1));

  it('shows the session error, asking to reopen the app, when a clear that passed the limit never ends', async () => {
    await renderApp();
    mockClearHangs = true;

    await pressSignOut();
    await giveUp();
    expect(await screen.findByText('Terminando de cerrar la sesión anterior')).toBeOnTheScreen();

    await giveUp();

    expect(await screen.findByText('No pudimos terminar de cerrar la sesión')).toBeOnTheScreen();
    expect(screen.getByText(/Cierra la app por completo/)).toBeOnTheScreen();
    expect(screen.queryByText('Terminando de cerrar la sesión anterior')).toBeNull();
    expect(JSON.stringify(jest.mocked(console.warn).mock.calls)).not.toContain('coach');
  });

  it('rejects a sign-out whose unsent count never ends, keeping the session', async () => {
    const session = await renderSession();
    mockUnsent = new Promise(() => {});

    let outcome: unknown;
    await act(async () => {
      outcome = session.current.signOut().then(() => 'resolved', (error: Error) => error.message);
    });
    await giveUp();

    expect(await outcome).toMatch(/timed out/);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('shows the sign-in when the stored session is never read, and the session if it arrives late', async () => {
    mockRestoreHangs = true;
    await renderProbe();
    expect(screen.queryByText('signed-out')).toBeNull();

    await giveUp();

    expect(await screen.findByText('signed-out')).toBeOnTheScreen();
    expect(JSON.stringify(jest.mocked(console.warn).mock.calls)).toContain('[session]');

    await act(async () => mockAuthCallback('INITIAL_SESSION', mockSignedIn));
    expect(await screen.findByText('signed-in')).toBeOnTheScreen();
  });

  it('shows the session error, not a blank screen, when clearing another owner\'s data never ends', async () => {
    mockOwner = 'coach-0';
    mockClearHangs = true;
    await renderProbe();

    await giveUp();

    expect(await screen.findByText('No pudimos abrir los datos del teléfono')).toBeOnTheScreen();
    expect(screen.queryByText('signed-in')).toBeNull();
    expect(mockOwner).toBe('coach-0');
  });

  it('shows the session error when counting the unsent records never ends', async () => {
    mockOwner = 'coach-0';
    mockUnsent = new Promise(() => {});
    await renderProbe();

    await giveUp();

    expect(await screen.findByText('No pudimos abrir los datos del teléfono')).toBeOnTheScreen();
  });

  it('lets the person retry, or sign out, from that error', async () => {
    mockOwner = 'coach-0';
    mockClearHangs = true;
    await renderProbe();
    await giveUp();
    await screen.findByText('No pudimos abrir los datos del teléfono');

    mockClearHangs = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByText('signed-in')).toBeOnTheScreen();
    expect(mockOwner).toBe('coach-1');
  });

  it('logs the failed step without anything about the person', async () => {
    mockOwner = 'coach-0';
    mockClearHangs = true;
    await renderProbe();

    await giveUp();
    await screen.findByText('No pudimos abrir los datos del teléfono');

    const logged = JSON.stringify(jest.mocked(console.warn).mock.calls);
    expect(logged).toContain('[session]');
    expect(logged).not.toContain('coach');
  });

  it('rejects a sign-out whose clearing never ends and keeps the app from writing meanwhile', async () => {
    const session = await renderSession();
    mockClearHangs = true;
    mockCalls.length = 0;
    mockSetSessionUser.mockClear();

    let outcome: unknown;
    await act(async () => {
      outcome = session.current.signOut().then(() => 'resolved', (error: Error) => error.message);
    });
    await giveUp();

    expect(await outcome).toMatch(/timed out/);
    expect(mockSignOut).not.toHaveBeenCalled();
    // The database may still be emptying: no screen of the signed-in person is shown, and no write is accepted for them.
    expect(session.current.session).toBeNull();
    expect(mockSetSessionUser).toHaveBeenLastCalledWith(undefined);
  });

  // A sign-out whose clear passed the limit; `settle` ends that clear late.
  async function signOutWithLateClear() {
    let settle: { resolve: () => void; reject: (error: Error) => void } = { resolve: () => {}, reject: () => {} };
    const session = await renderSession();
    mockClearGate = new Promise<void>((resolve, reject) => (settle = { resolve, reject }));
    mockCalls.length = 0;
    mockSetSessionUser.mockClear();
    let outcome: unknown;
    await act(async () => {
      outcome = session.current.signOut().then(() => 'resolved', (error: Error) => error.message);
    });
    await giveUp();
    expect(await outcome).toMatch(/timed out/);
    return { session, settle };
  }

  it('finishes the sign-out when a clear that passed the limit ends well, with no write in between', async () => {
    mockSignOut.mockImplementation(async () => {
      mockCalls.push('auth.signOut');
      mockAuthCallback('SIGNED_OUT', null);
      return { error: null };
    });
    const { session, settle } = await signOutWithLateClear();

    // While the clear runs: nobody is signed in for the screens, writes are refused, nothing else touches the database.
    expect(session.current.session).toBeNull();
    expect(mockSetSessionUser).toHaveBeenLastCalledWith(undefined);
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockCalls).toEqual(['connector.cancelWaits', 'db.disconnectAndClear:started']);

    await act(async () => settle.resolve());

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(session.current.session).toBeNull();
    expect(mockCalls).not.toContain('db.connect');
    expect(mockSetSessionUser).not.toHaveBeenCalledWith('coach-1');
  });

  it('gives the session and the sync back when a clear that passed the limit then fails', async () => {
    const { session, settle } = await signOutWithLateClear();
    expect(session.current.session).toBeNull();

    await act(async () => settle.reject(new Error('disk full')));

    await waitFor(() => expect(session.current.session).toBe(mockSignedIn));
    expect(mockSetSessionUser).toHaveBeenLastCalledWith('coach-1');
    expect(mockCalls).toContain('db.connect');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('keeps refusing writes through a token refresh while the late clear runs, and says a sign-out is finishing', async () => {
    const { session } = await signOutWithLateClear();

    await act(async () => mockAuthCallback('TOKEN_REFRESHED', mockSignedIn));

    expect(mockSetSessionUser).toHaveBeenLastCalledWith(undefined);
    expect(session.current.signingOut).toBe(true);
  });

  it('reconnects the sync when the clear of a sign-out fails before the limit', async () => {
    const session = await renderSession();
    mockClearError = new Error('disk full');
    mockCalls.length = 0;

    await act(async () => {
      await expect(session.current.signOut()).rejects.toThrow('disk full');
    });

    expect(mockCalls).toEqual(['connector.cancelWaits', 'db.connect']);
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(session.current.session).toBe(mockSignedIn);
  });

  it('makes another account wait for the late clear: no write before it ends, its screen after', async () => {
    const other = { access_token: 'token-2', user: { id: 'coach-2' } };
    await renderApp();
    let settle: () => void = () => {};
    mockClearGate = new Promise<void>((resolve) => (settle = resolve));
    await pressSignOut();
    await giveUp();
    expect(await screen.findByText('Terminando de cerrar la sesión anterior')).toBeOnTheScreen();
    mockSetSessionUser.mockClear();
    mockCalls.length = 0;

    await act(async () => mockAuthCallback('SIGNED_IN', other));

    // The clear is still running: the new account has no session on screen, no write is accepted and nothing else touches the database.
    expect(screen.getByText('Terminando de cerrar la sesión anterior')).toBeOnTheScreen();
    expect(screen.queryByText('signed-in:coach-2')).toBeNull();
    expect(mockSetSessionUser).not.toHaveBeenCalledWith('coach-2');
    // Only the earlier person's sync stops (the session changed); nothing is cleared, saved or connected for the new one.
    expect(mockCalls).toEqual(['connector.cancelWaits', 'db.disconnect']);

    await act(async () => settle());

    expect(await screen.findByText('signed-in:coach-2')).toBeOnTheScreen();
    expect(screen.queryByText('Terminando de cerrar la sesión anterior')).toBeNull();
    expect(mockSetSessionUser).toHaveBeenLastCalledWith('coach-2');
    // The earlier clear ended before anything of the new account was checked, written or connected.
    expect(mockCalls.slice(2)).toEqual(['connector.cancelWaits', 'db.disconnectAndClear', 'owner=coach-2', 'db.connect']);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('makes the same account signing in again wait for the late clear, and keeps its new session', async () => {
    // Fixture tokens carry a session_id each: a new sign-in is a new session.
    mockInitialSession = { access_token: tokenOf('session-first', '1'), user: { id: 'coach-1' } };
    const again = { access_token: tokenOf('session-again', '1'), user: { id: 'coach-1' } };
    await renderApp();
    let settle: () => void = () => {};
    mockClearGate = new Promise<void>((resolve) => (settle = resolve));
    await pressSignOut();
    await giveUp();
    await screen.findByText('Terminando de cerrar la sesión anterior');
    mockSetSessionUser.mockClear();
    mockCalls.length = 0;

    await act(async () => mockAuthCallback('SIGNED_IN', again));

    expect(screen.getByText('Terminando de cerrar la sesión anterior')).toBeOnTheScreen();
    expect(mockSetSessionUser).not.toHaveBeenCalledWith('coach-1');

    await act(async () => settle());

    expect(await screen.findByText('signed-in:coach-1')).toBeOnTheScreen();
    expect(mockSetSessionUser).toHaveBeenLastCalledWith('coach-1');
    // Signing in again is not the sign-out finishing: that session is not ended, and the sync connects once the clear is over.
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockCalls).toContain('db.connect');
  });

  // An access token as Supabase issues it: only the session_id claim matters here.
  const tokenOf = (sessionId: string, nonce: string) =>
    `header.${Buffer.from(JSON.stringify({ session_id: sessionId, nonce })).toString('base64url')}.signature`;

  async function signOutWaitingOnLateClear(initial: { access_token: string; user: { id: string } }) {
    mockInitialSession = initial;
    await render(
      <SessionProvider>
        <SignOutProbe />
      </SessionProvider>,
    );
    await screen.findByText('signed-in:coach-1');
    let settle: () => void = () => {};
    mockClearGate = new Promise<void>((resolve) => (settle = resolve));
    await pressSignOut();
    await giveUp();
    await screen.findByText('Terminando de cerrar la sesión anterior');
    return settle;
  }

  it('does not let the very same session notified again cancel the sign-out waiting for the late clear', async () => {
    const same = { access_token: tokenOf('session-a', '1'), user: { id: 'coach-1' } };
    const settle = await signOutWaitingOnLateClear(same);

    // A duplicate event of the session being closed: it is not a new sign-in.
    await act(async () => mockAuthCallback('SIGNED_IN', { ...same }));
    await act(async () => settle());

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' }));
  });

  it('reads the session_id of a base64url token that needs - or _ and padding, as a strict atob would', async () => {
    // Hermes-like atob: standard base64 only, padded; Node's is more forgiving.
    const strictAtob = (input: string) => {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input) || input.length % 4 !== 0) throw new Error('invalid base64');
      return Buffer.from(input, 'base64').toString('binary');
    };
    const spy = jest.spyOn(globalThis, 'atob').mockImplementation(strictAtob);
    try {
      const wide = (sessionId: string) => {
        const payload = Buffer.from(JSON.stringify({ session_id: sessionId, pad: '???>>>~~~' })).toString('base64url');
        // The fixture only proves something if the segment needs the base64url alphabet and padding.
        expect(payload).toMatch(/[-_]/);
        expect(payload.length % 4).not.toBe(0);
        return `header.${payload}.signature`;
      };
      const settle = await signOutWaitingOnLateClear({ access_token: wide('session-a'), user: { id: 'coach-1' } });

      // A new sign-in of the same account: readable on both sides, so it is a different session and keeps its new session.
      await act(async () => mockAuthCallback('SIGNED_IN', { access_token: wide('session-b'), user: { id: 'coach-1' } }));
      await act(async () => settle());

      expect(await screen.findByText('signed-in:coach-1')).toBeOnTheScreen();
      expect(mockSignOut).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps the writes of another account that signs in while the sign-out is being ended', async () => {
    let finishSignOut: () => void = () => {};
    mockSignOut.mockImplementation(async () => {
      await new Promise<void>((resolve) => (finishSignOut = resolve));
      return { error: null };
    });
    const settle = await signOutWaitingOnLateClear(mockSignedIn);
    await act(async () => settle());
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' }));

    await act(async () => mockAuthCallback('SIGNED_IN', { access_token: 'token-2', user: { id: 'coach-2' } }));
    await act(async () => finishSignOut());

    await waitFor(() => expect(mockSetSessionUser).toHaveBeenLastCalledWith('coach-2'));
  });

  it('does not let a refreshed access token of the same session cancel the sign-out', async () => {
    const settle = await signOutWaitingOnLateClear({ access_token: tokenOf('session-a', '1'), user: { id: 'coach-1' } });

    await act(async () => mockAuthCallback('SIGNED_IN', { access_token: tokenOf('session-a', '2'), user: { id: 'coach-1' } }));
    await act(async () => settle());

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' }));
  });

  it('lets the same account signing in with a new session cancel the sign-out', async () => {
    const settle = await signOutWaitingOnLateClear({ access_token: tokenOf('session-a', '1'), user: { id: 'coach-1' } });

    await act(async () => mockAuthCallback('SIGNED_IN', { access_token: tokenOf('session-b', '1'), user: { id: 'coach-1' } }));
    await act(async () => settle());

    expect(await screen.findByText('signed-in:coach-1')).toBeOnTheScreen();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockSetSessionUser).toHaveBeenLastCalledWith('coach-1');
  });

  it('fails closed: a session_id that cannot be read counts as the same session, so the sign-out completes', async () => {
    const settle = await signOutWaitingOnLateClear({ access_token: tokenOf('session-a', '1'), user: { id: 'coach-1' } });

    await act(async () => mockAuthCallback('SIGNED_IN', { access_token: 'not-a-jwt', user: { id: 'coach-1' } }));
    await act(async () => settle());

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' }));
  });

  it('never gives writes back to the person who signed out once the late clear ends', async () => {
    // The default sign-out mock does not emit SIGNED_OUT: only the provider decides who may write.
    await renderApp();
    let settle: () => void = () => {};
    mockClearGate = new Promise<void>((resolve) => (settle = resolve));
    await pressSignOut();
    await giveUp();
    await screen.findByText('Terminando de cerrar la sesión anterior');
    mockSetSessionUser.mockClear();

    await act(async () => settle());

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(mockSetSessionUser).not.toHaveBeenCalledWith('coach-1');
    expect(mockSetSessionUser).toHaveBeenLastCalledWith(undefined);
  });

});

describe('signOut result', () => {
  it('reports how many unsent records block it and how many of them the server rejected', async () => {
    mockUnsent = Promise.resolve(3);
    mockRejected = 1;
    const session = await renderSession();

    await expect(session.current.signOut()).resolves.toEqual({ status: 'blocked_pending', unsent: 3, rejected: 1 });
  });
});
