import { useEffect, useState } from 'react';

import type { ManagedAthleteRepository } from './managedAthletes';

// What the device says about the user as a guardian or an adult athlete. Local database only.
export type OwnLandingEvidence = {
  // Athletes the user manages, the own one included.
  managedCount: number;
  selfAthleteId: string | null;
  // Own authorizations: a guardian who has not added an athlete yet has no managed athlete, but has these.
  authorized: boolean;
};

// How long "/" waits for the first sync before it shows the home screen, which shows the sync state and signs out.
export const FIRST_SYNC_WAIT_MS = 5000;

export type LandingEvidence = {
  // The first sync reached this device. Before it, a coach's membership may not be here and would look like a guardian.
  synced: boolean;
  // The sync could not connect, or the wait for the first one ran out: nothing says it will come, so the wait ends in the home screen.
  syncGaveUp: boolean;
  staff: boolean | 'loading';
  own: OwnLandingEvidence | 'loading';
  // Online only: the one answer the device cannot give.
  platformAdmin: boolean | 'loading';
};

// home: the screen every role had so far. It stays the answer whenever nothing says the user is a guardian or an adult.
export type Landing = { kind: 'loading' } | { kind: 'home' } | { kind: 'athletes' } | { kind: 'athlete'; athleteId: string };

const loading: Landing = { kind: 'loading' };
const home: Landing = { kind: 'home' };

// Where a signed-in user lands on "/". School staff and platform admins keep the home screen, their only way to the timing, the plans, the
// console and the conflicts. Only a guardian or an adult athlete is sent away, so an unclear account never loses an entry it has today.
export function resolveLanding({ synced, syncGaveUp, staff, own, platformAdmin }: LandingEvidence): Landing {
  if (!synced) return syncGaveUp ? home : loading;
  if (staff === 'loading' || own === 'loading') return loading;
  if (staff) return home;
  if (own.managedCount === 0 && !own.authorized) return home;
  // The platform admin is asked online, so it is waited for only now that someone would be sent away.
  if (platformAdmin === 'loading') return loading;
  if (platformAdmin) return home;
  if (own.selfAthleteId && own.managedCount === 1) return { kind: 'athlete', athleteId: own.selfAthleteId };
  // A guardian, and an adult who also manages others: not decided yet. My athletes holds the own card too.
  return { kind: 'athletes' };
}

// True once FIRST_SYNC_WAIT_MS have passed since the screen opened.
export function useFirstSyncWaitExpired(): boolean {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), FIRST_SYNC_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  return expired;
}

const nothing: OwnLandingEvidence ={ managedCount: 0, selfAthleteId: null, authorized: false };

// Reads the evidence of the user from the device. A failed lookup reads as nothing, which keeps the home screen. Stored with the user who
// asked, so another user never inherits it. Changing `refreshKey` looks again.
export function useOwnLandingEvidence(
  managed: ManagedAthleteRepository,
  hasOwnAuthorizations: (userId: string) => Promise<boolean>,
  userId: string | undefined,
  refreshKey?: unknown,
): OwnLandingEvidence | 'loading' {
  const [answer, setAnswer] = useState<{ userId: string; evidence: OwnLandingEvidence }>();
  useEffect(() => {
    let active = true;
    if (userId) {
      Promise.all([managed.listManagedAthleteIds(userId), managed.getSelfAthleteId(userId), hasOwnAuthorizations(userId)])
        .then(([ids, selfAthleteId, authorized]) => ({ managedCount: ids.length, selfAthleteId, authorized }))
        .catch(() => nothing)
        .then((evidence) => active && setAnswer({ userId, evidence }));
    }
    return () => {
      active = false;
    };
  }, [managed, hasOwnAuthorizations, userId, refreshKey]);
  if (!userId) return nothing;
  return answer?.userId === userId ? answer.evidence : 'loading';
}
