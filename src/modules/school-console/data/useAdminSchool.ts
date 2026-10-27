import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { StaffSchool, StaffSchoolRepository } from './staffSchools';

export type AdminSchoolResult = { status: 'loading' } | { status: 'denied' } | { status: 'error'; retry: () => void } | { status: 'admin'; school: StaffSchool };
// `school` is the first school by name (the console shows that one); `schools` are all of them, for the timing to ask which one when there are several.
// 'error': the lookup itself failed, so nothing is known about the user. Each caller handles it: console.tsx shows an error view with `retry`, today.tsx offers `retry` in its notice, _layout.tsx keeps the bar, timing.tsx sends the user home, and index.tsx and athletes/[id].tsx treat it as not staff.
// `retry` looks again: the result goes back to 'loading', so the old error does not stay on screen. Callers must offer it: an error with no way to look again leaves the person stuck.
// shortcut: `retry` does nothing while a lookup started by a `refreshKey` change is running (the old error stays on screen until that lookup answers, then the answer replaces it); a retry then would cancel it and start the same lookup again. If that lookup never answers, the error stays and `retry` stays dead: the local database answers or fails, it does not hang, and a sync restarts the lookup. Upgrade by going to 'loading' when any lookup starts, which also changes what a sync shows, or when the lookup gets a timeout.
export type StaffSchoolResult = { status: 'loading' } | { status: 'denied' } | { status: 'error'; retry: () => void } | { status: 'staff'; school: StaffSchool; schools: StaffSchool[] };
type Settled = { status: 'denied' } | { status: 'error' } | FoundSchools;
type FoundSchools = { status: 'found'; school: StaffSchool; schools: StaffSchool[] };

const sameSchool = (a: StaffSchool, b: StaffSchool) => a.id === b.id && a.name === b.name;
const sameSettled = (a: Settled, b: Settled) =>
  a.status === b.status &&
  (a.status !== 'found' || (b.status === 'found' && a.schools.length === b.schools.length && a.schools.every((school, i) => sameSchool(school, b.schools[i]))));

// Looks up the schools of a user: the first one and the whole list. No user is a denial; a failed lookup is an error, which is not a denial.
// The answer is stored with the user who asked, so another user never inherits it while their own lookup runs.
// The result keeps its reference while nothing changes, so callers may use it as a dependency.
// A lookup that finds the same schools (same ids and names) keeps the previous answer, so a sync does not make a caller depending on it run again.
function useFirstSchool(
  list: (userId: string) => Promise<StaffSchool[]>,
  repository: StaffSchoolRepository,
  userId: string | undefined,
  refreshKey: unknown,
): Exclude<StaffSchoolResult, { status: 'staff' }> | FoundSchools {
  const [answer, setAnswer] = useState<{ userId: string; attempt: number; result: Settled }>();
  const [attempt, setAttempt] = useState(0);
  // A lookup started by `refreshKey` runs while the error is still on screen; a retry then would cancel it and start the same lookup again.
  // True only while a lookup is running: set when it starts, cleared when it answers or the effect cleans up, so an early return in the effect cannot leave it true.
  const running = useRef(false);
  // shortcut: `running` is set by the effect, after the render, so two presses of `retry` before that render both pass; they are batched into one attempt, so one lookup starts anyway. Upgrade if `retry` ever does more than count an attempt.
  const retry = useCallback(() => {
    if (!running.current) setAttempt((n) => n + 1);
  }, []);
  useEffect(() => {
    let active = true;
    if (userId) {
      running.current = true;
      const settle = (result: Settled) => {
        if (!active) return;
        running.current = false;
        setAnswer((previous) =>
          previous?.userId === userId && previous.attempt === attempt && sameSettled(previous.result, result) ? previous : { userId, attempt, result },
        );
      };
      list(userId)
        // shortcut: `school` is the first by name, with no picker in the console; the timing asks among `schools`. Upgrade when the console needs a school picker.
        .then((schools) => settle(schools[0] ? { status: 'found', school: schools[0], schools } : { status: 'denied' }))
        .catch(() => settle({ status: 'error' }));
    }
    return () => {
      active = false;
      running.current = false;
    };
    // `list` is a method of `repository`, so the repository is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, userId, refreshKey, attempt]);
  return useMemo(() => {
    if (!userId) return { status: 'denied' };
    if (answer?.userId !== userId || answer.attempt !== attempt) return { status: 'loading' };
    return answer.result.status === 'error' ? { status: 'error', retry } : answer.result;
  }, [userId, answer, attempt, retry]);
}

// Whether the user may open the school console. Memberships arrive with a sync, so the caller changes `refreshKey` to look again.
// An error is not a denial: the caller shows it with a way to look again, and only a real denial leaves the console.
export function useAdminSchool(
  repository: StaffSchoolRepository,
  userId: string | undefined,
  refreshKey?: unknown,
): AdminSchoolResult {
  const result = useFirstSchool((id) => repository.listAdminSchools(id), repository, userId, refreshKey);
  return useMemo((): AdminSchoolResult => (result.status === 'found' ? { status: 'admin', school: result.school } : result), [result]);
}

// Whether the user belongs to a school with any role (coach or admin): the people who time and plan.
export function useStaffSchool(
  repository: StaffSchoolRepository,
  userId: string | undefined,
  refreshKey?: unknown,
): StaffSchoolResult {
  const result = useFirstSchool((id) => repository.listStaffSchools(id), repository, userId, refreshKey);
  return useMemo(
    (): StaffSchoolResult => (result.status === 'found' ? { status: 'staff', school: result.school, schools: result.schools } : result),
    [result],
  );
}
