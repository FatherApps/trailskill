import { useCallback, useEffect, useState } from 'react';

import type { StaffSchool, StaffSchoolRepository } from './staffSchools';

export type AdminSchoolResult = { status: 'loading' } | { status: 'denied' } | { status: 'admin'; school: StaffSchool };
// `school` is the first school by name (the console shows that one); `schools` are all of them, for the timing to ask which one when there are several.
// 'error': the lookup itself failed, so nothing is known about the user; callers decide what that means for them.
// `retry` looks again: the result goes back to 'loading', so the old error does not stay on screen. Callers that do not retry ignore it.
export type StaffSchoolResult = { status: 'loading' } | { status: 'denied' } | { status: 'error'; retry?: () => void } | { status: 'staff'; school: StaffSchool; schools: StaffSchool[] };
type Settled = { status: 'denied' } | { status: 'error'; retry?: () => void } | FoundSchools;
type FoundSchools = { status: 'found'; school: StaffSchool; schools: StaffSchool[] };

// Looks up the schools of a user: the first one and the whole list. No user is a denial; a failed lookup is an error, which admin access treats as a denial.
// The answer is stored with the user who asked, so another user never inherits it while their own lookup runs.
function useFirstSchool(
  list: (userId: string) => Promise<StaffSchool[]>,
  repository: StaffSchoolRepository,
  userId: string | undefined,
  refreshKey: unknown,
): { status: 'loading' } | Settled {
  const [answer, setAnswer] = useState<{ userId: string; attempt: number; result: Settled }>();
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let active = true;
    if (userId) {
      const settle = (result: Settled) =>
        active && setAnswer({ userId, attempt, result });
      list(userId)
        // shortcut: `school` is the first by name, with no picker in the console; the timing asks among `schools`. Upgrade when the console needs a school picker.
        .then((schools) => settle(schools[0] ? { status: 'found', school: schools[0], schools } : { status: 'denied' }))
        .catch(() => settle({ status: 'error' }));
    }
    return () => {
      active = false;
    };
    // `list` is a method of `repository`, so the repository is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, userId, refreshKey, attempt]);
  if (!userId) return { status: 'denied' };
  if (answer?.userId !== userId || answer.attempt !== attempt) return { status: 'loading' };
  return answer.result.status === 'error' ? { status: 'error', retry } : answer.result;
}

// Whether the user may open the school console. Memberships arrive with a sync, so the caller changes `refreshKey` to look again.
export function useAdminSchool(
  repository: StaffSchoolRepository,
  userId: string | undefined,
  refreshKey?: unknown,
): AdminSchoolResult {
  const result = useFirstSchool((id) => repository.listAdminSchools(id), repository, userId, refreshKey);
  if (result.status === 'error') return { status: 'denied' };
  return result.status === 'found' ? { status: 'admin', school: result.school } : result;
}

// Whether the user belongs to a school with any role (coach or admin): the people who time and plan.
export function useStaffSchool(
  repository: StaffSchoolRepository,
  userId: string | undefined,
  refreshKey?: unknown,
): StaffSchoolResult {
  const result = useFirstSchool((id) => repository.listStaffSchools(id), repository, userId, refreshKey);
  return result.status === 'found' ? { status: 'staff', school: result.school, schools: result.schools } : result;
}
