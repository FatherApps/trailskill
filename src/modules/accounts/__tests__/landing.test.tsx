import { render, waitFor } from '@testing-library/react-native';

import { createInMemoryManagedAthleteRepository, type ManagedAthleteRow } from '../data/managedAthletes';
import { resolveLanding, useOwnLandingEvidence, type LandingEvidence, type OwnLandingEvidence } from '../data/landing';

// The sync layer is ESM-only for Jest; the in-memory repositories never reach it.
jest.mock('../../../core/sync', () => ({ db: {} }));

const guardian: OwnLandingEvidence = { managedCount: 2, selfAthleteId: null, authorized: true };
const adult: OwnLandingEvidence = { managedCount: 1, selfAthleteId: 'self-1', authorized: true };
const nobody: OwnLandingEvidence = { managedCount: 0, selfAthleteId: null, authorized: false };
const base: LandingEvidence = { synced: true, staff: false, own: nobody, platformAdmin: false };
const landing = (evidence: Partial<LandingEvidence>) => resolveLanding({ ...base, ...evidence });

describe('resolveLanding: one landing per role', () => {
  it('sends a guardian to My athletes', () => {
    expect(landing({ own: guardian })).toEqual({ kind: 'athletes' });
  });

  it('sends an adult athlete straight to their own profile', () => {
    expect(landing({ own: adult })).toEqual({ kind: 'athlete', athleteId: 'self-1' });
  });

  it('sends a guardian who has not added an athlete yet to My athletes', () => {
    expect(landing({ own: { managedCount: 0, selfAthleteId: null, authorized: true } })).toEqual({ kind: 'athletes' });
  });

  it('keeps school staff, coach or admin, on the home screen', () => {
    expect(landing({ staff: true })).toEqual({ kind: 'home' });
  });

  it('keeps a platform admin on the home screen', () => {
    expect(landing({ platformAdmin: true })).toEqual({ kind: 'home' });
  });

  it('keeps an account with no sign of being a guardian or an adult on the home screen', () => {
    expect(landing({})).toEqual({ kind: 'home' });
  });
});

describe('resolveLanding: accounts with several roles', () => {
  it('lets staff win over a guardian, who keeps the timing entry', () => {
    expect(landing({ staff: true, own: guardian })).toEqual({ kind: 'home' });
  });

  it('lets staff win over an adult athlete', () => {
    expect(landing({ staff: true, own: adult })).toEqual({ kind: 'home' });
  });

  it('lets a platform admin who is also a guardian keep the home screen', () => {
    expect(landing({ platformAdmin: true, own: guardian })).toEqual({ kind: 'home' });
  });

  // Not decided yet: Mis deportistas holds the own card too. Changing the answer is this one case.
  it('sends an adult athlete who also manages others to My athletes', () => {
    expect(landing({ own: { managedCount: 3, selfAthleteId: 'self-1', authorized: true } })).toEqual({ kind: 'athletes' });
  });
});

describe('resolveLanding: waiting for data', () => {
  it('waits for the first sync, because a membership may not be on the device yet', () => {
    expect(landing({ synced: false, own: guardian })).toEqual({ kind: 'loading' });
    expect(landing({ synced: false, staff: true })).toEqual({ kind: 'loading' });
  });

  it('waits while the membership lookup runs, without showing the home screen', () => {
    expect(landing({ staff: 'loading', own: guardian })).toEqual({ kind: 'loading' });
  });

  it('waits while the local rows are read', () => {
    expect(landing({ own: 'loading' })).toEqual({ kind: 'loading' });
  });

  it('waits for the platform admin answer only when there is a guardian or an adult to send away', () => {
    expect(landing({ platformAdmin: 'loading', own: guardian })).toEqual({ kind: 'loading' });
    expect(landing({ platformAdmin: 'loading', own: adult })).toEqual({ kind: 'loading' });
    expect(landing({ platformAdmin: 'loading', own: nobody })).toEqual({ kind: 'home' });
    expect(landing({ platformAdmin: 'loading', staff: true, own: guardian })).toEqual({ kind: 'home' });
  });
});

describe('useOwnLandingEvidence', () => {
  const rows: ManagedAthleteRow[] = [
    { userId: 'guardian-1', athleteId: 'a1', relation: 'guardian' },
    { userId: 'guardian-1', athleteId: 'a2', relation: 'guardian' },
    { userId: 'adult-1', athleteId: 'a3', relation: 'self' },
    { userId: 'coach-1', athleteId: 'a1', relation: 'guardian' },
  ];
  // Stable identity: the hook looks again whenever a repository changes.
  const hasAuthorization = async (id: string) => ['guardian-1', 'adult-1'].includes(id);

  async function read(userId: string | undefined, managed = createInMemoryManagedAthleteRepository(rows)) {
    const seen: { current?: ReturnType<typeof useOwnLandingEvidence>; first?: ReturnType<typeof useOwnLandingEvidence> } = {};
    function Probe() {
      seen.current = useOwnLandingEvidence(managed, hasAuthorization, userId);
      seen.first ??= seen.current;
      return null;
    }
    await render(<Probe />);
    return seen;
  }

  it('counts the athletes of a guardian and finds no own athlete', async () => {
    const seen = await read('guardian-1');

    await waitFor(() => expect(seen.current).toEqual({ managedCount: 2, selfAthleteId: null, authorized: true }));
  });

  it('finds the own athlete of an adult', async () => {
    const seen = await read('adult-1');

    await waitFor(() => expect(seen.current).toEqual({ managedCount: 1, selfAthleteId: 'a3', authorized: true }));
  });

  it('finds nothing for a user with no rows, whatever other users have', async () => {
    const seen = await read('nobody');

    await waitFor(() => expect(seen.current).toEqual({ managedCount: 0, selfAthleteId: null, authorized: false }));
  });

  it('reads as nothing when the local lookup fails, so the home screen stays reachable', async () => {
    const failing = { listManagedAthleteIds: jest.fn().mockRejectedValue(new Error('db')), getSelfAthleteId: jest.fn().mockRejectedValue(new Error('db')) };
    const seen = await read('guardian-1', failing);

    await waitFor(() => expect(seen.current).toEqual(nobody));
  });

  it('is loading until it answers', async () => {
    const seen = await read('guardian-1');

    expect(seen.first).toBe('loading');
  });

  it('has nothing to read with no user', async () => {
    const seen = await read(undefined);

    expect(seen.current).toEqual(nobody);
  });
});
