import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { db, SupabaseConnector } from '../../sync';
import { CodeMismatchError, SessionProvider, signOutDecision, useSession } from '../SessionProvider';

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
const mockSignedIn = { access_token: 'token', user: { id: 'coach-1' } };
const mockSignInWithOtp = jest.fn();
const mockVerifyOtp = jest.fn();
const mockSignOut = jest.fn();
const mockGetSession = jest.fn();

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
  countUnsentRecords: async () => ({ unsent: await mockUnsent, rejected: mockRejected }),
  get supabaseConfigError() {
    return mockConfigError;
  },
  SupabaseConnector: jest.fn(() => ({ cancelWaits: () => mockCalls.push('connector.cancelWaits') })),
  db: {
    connect: jest.fn(() => mockConnect()),
    disconnect: jest.fn(async () => mockCalls.push('db.disconnect')),
    disconnectAndClear: jest.fn(async () => {
      if (mockClearError) throw mockClearError;
      mockCalls.push('db.disconnectAndClear');
      mockUnsent = Promise.resolve(0);
    }),
  },
  supabase: {
    auth: {
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        mockAuthCallback = callback;
        callback('INITIAL_SESSION', mockInitialSession);
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      getSession: () => mockGetSession(),
    },
  },
}));

beforeEach(() => {
  mockCalls.length = 0;
  mockConfigError = null;
  mockInitialSession = mockSignedIn;
  mockOwner = 'coach-1';
  mockOwnerError = undefined;
  mockClearError = undefined;
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

  it('flags a failed sync connection instead of leaving an unhandled rejection', async () => {
    mockConnect = () => Promise.reject(new Error('unreachable'));
    const session = await renderSession();

    await waitFor(() => expect(session.current.syncConnectFailed).toBe(true));
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

describe('signOut result', () => {
  it('reports how many unsent records block it and how many of them the server rejected', async () => {
    mockUnsent = Promise.resolve(3);
    mockRejected = 1;
    const session = await renderSession();

    await expect(session.current.signOut()).resolves.toEqual({ status: 'blocked_pending', unsent: 3, rejected: 1 });
  });
});
