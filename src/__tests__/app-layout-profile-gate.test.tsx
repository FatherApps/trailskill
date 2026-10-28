import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';

import AppLayout from '../app/(app)/_layout';

// Everything the layout reaches for lives in `world`, read when a repository is used, so each test builds its own.
type World = {
  synced: boolean;
  // Rows already on the device.
  localStaff: boolean;
  localManaged: boolean;
  localAuthorizations: boolean;
  // Rows on the server; `failing` is the lack of signal.
  online: { rows: { source: string; userId: string }[]; failing: boolean; pending?: boolean };
  draft: Record<string, unknown> | null;
  savedProfile: { userId: string; firstName: string; lastName: string } | null;
};
const USER = 'user-1';
const EMAIL = 'paula.gomez@example.test';
const world: { current: World } = { current: undefined as unknown as World };
(globalThis as unknown as { mockWorld: typeof world }).mockWorld = world;

// Avoid loading the native PowerSync database.
jest.mock('../core/sync', () => ({
  db: {},
  supabase: {},
  useGlobalSyncSummary: () => ({
    lastSyncedAt: (globalThis as unknown as { mockWorld: { current: { synced: boolean } } }).mockWorld.current.synced ? new Date(1) : null,
  }),
}));
jest.mock('expo-secure-store', () => ({}));

const mockSignOut = jest.fn();
jest.mock('../core/session', () => ({
  ...jest.requireActual('../core/session'),
  useSession: () => ({
    session: {
      user: {
        id: 'user-1',
        email: 'paula.gomez@example.test',
        app_metadata: { provider: 'google' },
        user_metadata: { given_name: 'Paula', family_name: 'Gómez' },
      },
    },
    signOut: mockSignOut,
  }),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Stack: () => require('react').createElement(require('react-native').View, { testID: 'app-stack' }),
  useSegments: () => ['(app)'],
  useRouter: () => ({ replace: mockReplace, navigate: jest.fn() }),
}));

// A repository that reads its data from the test's world when it is used, not when the layout module loads.
function mockLazy<T extends object>(build: (w: World) => T): T {
  return new Proxy({} as T, {
    get:
      (_target, key) =>
      (...args: unknown[]) =>
        (build((globalThis as unknown as { mockWorld: { current: World } }).mockWorld.current) as Record<string | symbol, (...a: unknown[]) => unknown>)[key](...args),
  });
}

jest.mock('../modules/accounts', () => ({
  ...jest.requireActual('../modules/accounts'),
  createSecureStoreRegistrationDraftRepository: () =>
    mockLazy((w) => ({
      load: async () => w.draft,
      save: async (draft: Record<string, unknown>) => {
        w.draft = draft;
      },
      clear: async () => {
        w.draft = null;
      },
    })),
  createSupabaseProfileEvidenceRepository: () =>
    mockLazy((w) => ({
      hasProfile: async (userId: string) => {
        if (w.online.failing) throw new Error('no signal');
        // Never answers: the lookup is still running.
        if (w.online.pending) return new Promise<boolean>(() => {});
        return w.online.rows.some((row) => row.userId === userId);
      },
    })),
  createSupabaseAdultProfileRepository: () =>
    mockLazy((w) => ({
      save: async (profile: World['savedProfile']) => {
        w.savedProfile = profile;
        return profile;
      },
    })),
  createPowerSyncManagedAthleteRepository: () =>
    mockLazy((w) => ({ listManagedAthleteIds: async () => (w.localManaged ? ['a1'] : []) })),
  createPowerSyncOwnAuthorizationEvidence: () => async () =>
    (globalThis as unknown as { mockWorld: { current: { localAuthorizations: boolean } } }).mockWorld.current.localAuthorizations,
  createPowerSyncManagedAthleteProfileRepository: () => ({ createManagedAthlete: async () => 'a1' }),
  createSecureStorePendingInvitationRepository: () => ({ clear: async () => {} }),
  createSupabaseInvitationRepository: () => ({ resolve: async () => ({ school: 'School', group: 'Group', categories: [] }) }),
  usePendingInvitations: jest.fn(),
}));
jest.mock('../modules/school-console', () => ({
  ...jest.requireActual('../modules/school-console'),
  createPowerSyncStaffSchoolRepository: () =>
    mockLazy((w) => ({
      listStaffSchools: async () => (w.localStaff ? [{ id: 's1', name: 'School' }] : []),
      listAdminSchools: async () => [],
    })),
}));
jest.mock('../modules/athletes', () => ({
  ...jest.requireActual('../modules/athletes'),
  createPowerSyncAthleteRepository: () => ({}),
  createPowerSyncSchoolAthleteRepository: () => ({}),
}));

const PANEL_TITLE = 'Casi listo, Paula';

function arrange(overrides: Partial<World> = {}) {
  world.current = {
    synced: true,
    localStaff: false,
    localManaged: false,
    localAuthorizations: false,
    online: { rows: [], failing: false },
    draft: null,
    savedProfile: null,
    ...overrides,
  };
  mockReplace.mockClear();
  mockSignOut.mockReset().mockResolvedValue({ status: 'signed_out' });
}

describe('app layout: a session with no profile', () => {
  it('a new Google account goes to the registration steps and not to the app', async () => {
    arrange();
    await render(<AppLayout />);

    expect(await screen.findByText(PANEL_TITLE)).toBeOnTheScreen();
    expect(screen.queryByTestId('app-stack')).not.toBeOnTheScreen();
  });

  it('the panel shows the verified email and takes the names from the provider', async () => {
    arrange();
    await render(<AppLayout />);

    expect(await screen.findByText(EMAIL)).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Paula')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Gómez')).toBeOnTheScreen();
  });

  it('shows neither the panel nor the app while the lookup has not answered', async () => {
    arrange({ online: { rows: [], failing: false, pending: true } });
    await render(<AppLayout />);

    expect(screen.queryByText(PANEL_TITLE)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('app-stack')).not.toBeOnTheScreen();
  });
});

describe('app layout: an account with a profile enters as today', () => {
  it.each([
    ['a guardian or an adult athlete (managed athletes on the device)', { localManaged: true }],
    ['a coach or an admin (memberships on the device)', { localStaff: true }],
    ['a guardian who has not added an athlete yet (own authorizations on the device)', { localAuthorizations: true }],
    ['a platform admin (found online)', { synced: false, online: { rows: [{ source: 'platform_admins', userId: USER }], failing: false } }],
    ['an invited account (adult profile found online)', { online: { rows: [{ source: 'adult_profiles', userId: USER }], failing: false } }],
  ])('%s', async (_who, overrides: Partial<World>) => {
    arrange(overrides);
    await render(<AppLayout />);

    expect(await screen.findByTestId('app-stack')).toBeOnTheScreen();
    expect(screen.queryByText(PANEL_TITLE)).not.toBeOnTheScreen();
  });

  it('staff with memberships and no adult profile enters and never sees the registration', async () => {
    arrange({ localStaff: true });
    await render(<AppLayout />);

    expect(await screen.findByTestId('app-stack')).toBeOnTheScreen();
    expect(screen.queryByText(PANEL_TITLE)).not.toBeOnTheScreen();
  });

  it('a draft for the same email keeps today\'s path: the registration is finished and the next step opens', async () => {
    arrange({ draft: { swimmer: 'child', firstName: 'Paula', lastName: 'Gómez', email: EMAIL, codeRequested: true } });
    await render(<AppLayout />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/athletes/add'));
    expect(screen.queryByText(PANEL_TITLE)).not.toBeOnTheScreen();
    expect(world.current.savedProfile).toEqual({ userId: USER, firstName: 'Paula', lastName: 'Gómez' });
  });
});

describe('app layout: first sign-in with no signal', () => {
  it('waits with a retry and never shows the registration or the app, however it is asked', async () => {
    arrange({ synced: false, online: { rows: [], failing: true } });
    await render(<AppLayout />);

    expect(await screen.findByRole('button', { name: 'Intentar de nuevo' })).toBeOnTheScreen();
    expect(screen.queryByText(PANEL_TITLE)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('app-stack')).not.toBeOnTheScreen();
  });

  it('a failed lookup is not a missing profile', async () => {
    arrange({ synced: true, online: { rows: [], failing: true } });
    await render(<AppLayout />);

    await screen.findByRole('button', { name: 'Intentar de nuevo' });
    expect(screen.queryByText(PANEL_TITLE)).not.toBeOnTheScreen();
  });

  it('retry asks again once there is signal', async () => {
    arrange({ synced: false, online: { rows: [], failing: true } });
    await render(<AppLayout />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Intentar de nuevo' }));
    world.current.online.failing = false;
    world.current.online.rows = [{ source: 'adult_profiles', userId: USER }];
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByTestId('app-stack')).toBeOnTheScreen();
  });

  it('a person who already uses the app opens it with no signal', async () => {
    arrange({ synced: true, localManaged: true, online: { rows: [], failing: true } });
    await render(<AppLayout />);

    expect(await screen.findByTestId('app-stack')).toBeOnTheScreen();
  });
});

describe('app layout: the registration steps after the panel', () => {
  it.each([
    ['Acudiente', '/athletes/add'],
    ['Deportista adulto', '/athletes/authorizations'],
  ])('%s: saves the profile and goes on to the next existing step, then the app', async (who, next) => {
    arrange();
    await render(<AppLayout />);
    await fireEvent.press(await screen.findByRole('radio', { name: new RegExp(who) }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(next));
    expect(world.current.savedProfile).toEqual({ userId: USER, firstName: 'Paula', lastName: 'Gómez' });
    expect(await screen.findByTestId('app-stack')).toBeOnTheScreen();
  });

  it('the person has to say who registers before going on', async () => {
    arrange();
    await render(<AppLayout />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Continuar' }));

    expect(screen.getByText('Elige cómo te registras.')).toBeOnTheScreen();
    expect(world.current.savedProfile).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('asks for the name when it was cleared', async () => {
    arrange();
    await render(<AppLayout />);
    await fireEvent.changeText(await screen.findByDisplayValue('Paula'), '');
    await fireEvent.press(screen.getByRole('radio', { name: /Acudiente/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText('Escribe tu nombre.')).toBeOnTheScreen();
    expect(world.current.savedProfile).toBeNull();
  });
});

describe('app layout: leaving the registration with Volver', () => {
  const leftOver = { swimmer: 'child', firstName: '', lastName: '', email: 'someone@example.test', codeRequested: true, invitationToken: 'a'.repeat(32) };
  const pendingTitle = '¿Cerrar sesión con registros sin enviar?';

  it('signs out and deletes the draft the next person would find', async () => {
    arrange({ draft: leftOver });
    await render(<AppLayout />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Volver' }));

    await waitFor(() => expect(world.current.draft).toBeNull());
    expect(mockSignOut).toHaveBeenCalledWith();
  });

  it('with unsent records it asks first, as the sign-out button does, and keeps the draft', async () => {
    arrange({ draft: leftOver });
    mockSignOut.mockResolvedValue({ status: 'blocked_pending', unsent: 2, rejected: 0 });
    await render(<AppLayout />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Volver' }));

    expect(await screen.findByRole('header', { name: pendingTitle })).toBeOnTheScreen();
    expect(screen.getByText(/Hay 2 registros sin enviar/)).toBeOnTheScreen();
    expect(world.current.draft).toEqual(leftOver);
  });

  it('signs out anyway when the person insists, and then deletes the draft', async () => {
    arrange({ draft: leftOver });
    mockSignOut.mockResolvedValueOnce({ status: 'blocked_pending', unsent: 2, rejected: 0 });
    await render(<AppLayout />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Volver' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cerrar sesión igual' }));

    await waitFor(() => expect(world.current.draft).toBeNull());
    expect(mockSignOut).toHaveBeenLastCalledWith({ force: true });
  });

  it('tells the person when signing out failed instead of staying silent', async () => {
    arrange({ draft: leftOver });
    mockSignOut.mockRejectedValue(new Error('storage'));
    await render(<AppLayout />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Volver' }));

    expect(await screen.findByText('No pudimos cerrar la sesión. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(world.current.draft).toEqual(leftOver);
  });
});

// Keeps the View import used by the Stack mock typing in strict lint setups.
void View;
