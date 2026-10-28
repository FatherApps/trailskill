import { act, render, waitFor } from '@testing-library/react-native';

import { createInMemoryStaffSchoolRepository } from '../../school-console';
import { createInMemoryManagedAthleteRepository, type ManagedAthleteRow } from '../data/managedAthletes';
import { createInMemoryProfileEvidenceRepository, useProfileGate, type ProfileGate } from '../data/profileGate';
import { createInMemoryRegistrationDraftRepository, type RegistrationDraft } from '../data/registrationDraft';

// The Supabase repository sits next to the in-memory one; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('expo-secure-store', () => ({}));

const USER = 'user-1';
const EMAIL = 'paula@example.test';
const draft: RegistrationDraft = { firstName: 'Paula', lastName: 'Gomez', email: EMAIL, codeRequested: true, swimmer: 'adult' };

type Options = {
  draft?: RegistrationDraft | null;
  // The first sync reached this device.
  synced?: boolean;
  staff?: { userId: string; role: string }[];
  managed?: ManagedAthleteRow[];
  online?: Parameters<typeof createInMemoryProfileEvidenceRepository>[0];
};

// The local lookup is what the layout builds from the two local repositories: a membership or a managed athlete.
async function setup({ draft: stored = null, synced = true, staff = [], managed = [], online = {} }: Options = {}) {
  const drafts = createInMemoryRegistrationDraftRepository(stored);
  const staffSchools = createInMemoryStaffSchoolRepository(staff.map((row) => ({ ...row, schoolId: 's1', schoolName: 'School' })));
  const managedAthletes = createInMemoryManagedAthleteRepository(managed);
  const evidence = createInMemoryProfileEvidenceRepository(online);
  const local = { arrived: false };
  const hasLocalProfile = async (userId: string) =>
    local.arrived || (await staffSchools.listStaffSchools(userId)).length > 0 || (await managedAthletes.listManagedAthleteIds(userId)).length > 0;
  const gate: { current?: ProfileGate } = {};
  const history: ProfileGate['status'][] = [];
  function Probe({ synced: ready, email = EMAIL }: { synced: boolean; email?: string }) {
    gate.current = useProfileGate({ userId: USER, email, drafts, localReady: ready, hasLocalProfile, evidence });
    history.push(gate.current.status);
    return null;
  }
  const view = await render(<Probe synced={synced} />);
  return { gate, history, evidence, local, view, Probe };
}

const status = (gate: { current?: ProfileGate }) => gate.current?.status;

describe('useProfileGate: an account with no profile', () => {
  it('goes to the registration steps when nothing says it has a profile', async () => {
    const { gate } = await setup();

    await waitFor(() => expect(status(gate)).toBe('register'));
  });

  it('waits while it checks, instead of showing the app or the registration', async () => {
    const { history } = await setup();

    // The first render, before any answer, is neither of the two destinations.
    expect(history[0]).toBe('checking');
    expect(history.slice(0, -1)).not.toContain('ready');
    expect(history.slice(0, -1)).not.toContain('register');
  });
});

describe('useProfileGate: an account with a profile enters as today', () => {
  it.each([
    ['a guardian', { managed: [{ userId: USER, athleteId: 'a1', relation: 'guardian' as const }] }],
    ['an adult athlete', { managed: [{ userId: USER, athleteId: 'a1', relation: 'self' as const }] }],
    ['a coach', { staff: [{ userId: USER, role: 'coach' }] }],
    ['a school admin', { staff: [{ userId: USER, role: 'school_admin' }] }],
  ])('%s with local rows enters without asking the network', async (_who, local: Options) => {
    const { gate, evidence } = await setup(local);

    await waitFor(() => expect(status(gate)).toBe('ready'));
    expect(evidence.calls).toBe(0);
  });

  it('staff with memberships and no adult profile does not go to the registration', async () => {
    const { gate } = await setup({ staff: [{ userId: USER, role: 'coach' }], online: {} });

    await waitFor(() => expect(status(gate)).toBe('ready'));
    expect(status(gate)).not.toBe('register');
  });

  it.each([
    ['a platform admin', 'platform_admins'],
    ['an adult profile (an invited account)', 'adult_profiles'],
    ['a membership not yet on the device', 'school_memberships'],
    ['a managed athlete not yet on the device', 'athlete_managers'],
  ] as const)('%s found online with no local rows enters', async (_who, source) => {
    const { gate, evidence } = await setup({ online: { rows: [{ source, userId: USER }] } });

    await waitFor(() => expect(status(gate)).toBe('ready'));
    expect(evidence.calls).toBe(1);
  });

  it('does not take the profile of another user as its own', async () => {
    const { gate } = await setup({ online: { rows: [{ source: 'adult_profiles', userId: 'someone-else' }] } });

    await waitFor(() => expect(status(gate)).toBe('register'));
  });
});

describe('useProfileGate: the registration draft', () => {
  it('a draft for the same email keeps today\'s path: no check, no registration', async () => {
    const { gate, evidence } = await setup({ draft });

    await waitFor(() => expect(status(gate)).toBe('ready'));
    expect(evidence.calls).toBe(0);
  });

  it('the email is compared without case or spaces', async () => {
    const { gate } = await setup({ draft: { ...draft, email: ` ${EMAIL.toUpperCase()} ` } });

    await waitFor(() => expect(status(gate)).toBe('ready'));
  });

  it('a draft typed for another email does not let the account skip the registration', async () => {
    const { gate } = await setup({ draft: { ...draft, email: 'someone@example.test' } });

    await waitFor(() => expect(status(gate)).toBe('register'));
  });
});

describe('useProfileGate: first sync and no signal', () => {
  it('before the first sync the empty local database is not read as "no profile"', async () => {
    // Local rows exist but the first sync has not reached the device: the lookup asks the server, which has the answer.
    const { gate, evidence } = await setup({ synced: false, online: { rows: [{ source: 'school_memberships', userId: USER }] } });

    await waitFor(() => expect(status(gate)).toBe('ready'));
    expect(evidence.calls).toBe(1);
  });

  it('first sign-in with no signal waits with a retry and never goes to the registration or the app', async () => {
    const { gate } = await setup({ synced: false, online: { failing: true } });

    await waitFor(() => expect(status(gate)).toBe('unreachable'));
    expect(status(gate)).not.toBe('register');
    expect(status(gate)).not.toBe('ready');
  });

  it('a failed lookup with a synced but empty local database is not "no profile" either', async () => {
    const { gate } = await setup({ synced: true, online: { failing: true } });

    await waitFor(() => expect(status(gate)).toBe('unreachable'));
  });

  it('a person who already uses the app opens it with no signal, without asking the network', async () => {
    const { gate, evidence } = await setup({ managed: [{ userId: USER, athleteId: 'a1' }], online: { failing: true } });

    await waitFor(() => expect(status(gate)).toBe('ready'));
    expect(evidence.calls).toBe(0);
  });

  it('retry asks again and the answer decides', async () => {
    const { gate, evidence } = await setup({ online: { failing: true } });
    await waitFor(() => expect(status(gate)).toBe('unreachable'));

    evidence.failing = false;
    await act(async () => gate.current?.recheck());

    await waitFor(() => expect(status(gate)).toBe('register'));
  });

  it('rows already on the device count before the first sync is reported (offline cold start)', async () => {
    const { gate, evidence } = await setup({ synced: false, staff: [{ userId: USER, role: 'coach' }], online: { failing: true } });

    await waitFor(() => expect(status(gate)).toBe('ready'));
    expect(evidence.calls).toBe(0);
  });

  it('looks again when the first sync arrives with the rows', async () => {
    const { gate, local, view, Probe } = await setup({ synced: false, online: { failing: true } });
    await waitFor(() => expect(status(gate)).toBe('unreachable'));

    local.arrived = true;
    await view.rerender(<Probe synced />);

    await waitFor(() => expect(status(gate)).toBe('ready'));
  });
});
