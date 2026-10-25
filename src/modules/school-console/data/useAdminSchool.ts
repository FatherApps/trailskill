import { useEffect, useState } from 'react';

import type { StaffSchool, StaffSchoolRepository } from './staffSchools';

export type AdminSchoolResult = { status: 'loading' } | { status: 'denied' } | { status: 'admin'; school: StaffSchool };
// `school` is the first school by name (the console shows that one); `schools` are all of them, for the timing to ask which one when there are several.
export type StaffSchoolResult = { status: 'loading' } | { status: 'denied' } | { status: 'staff'; school: StaffSchool; schools: StaffSchool[] };
type FoundSchools = { status: 'found'; school: StaffSchool; schools: StaffSchool[] };

// Looks up the schools of a user: the first one and the whole list. Fails closed: no user or a failed lookup is a denial.
// The answer is stored with the user who asked, so another user never inherits it while their own lookup runs.
function useFirstSchool(
  list: (userId: string) => Promise<StaffSchool[]>,
  repository: StaffSchoolRepository,
  userId: string | undefined,
  refreshKey: unknown,
): { status: 'loading' } | { status: 'denied' } | FoundSchools {
  const [answer, setAnswer] = useState<{ userId: string; result: { status: 'denied' } | FoundSchools }>();
  useEffect(() => {
    let active = true;
    if (userId) {
      const settle = (result: { status: 'denied' } | FoundSchools) =>
        active && setAnswer({ userId, result });
      list(userId)
        // shortcut: `school` is the first by name, with no picker in the console; the timing asks among `schools`. Upgrade when the console needs a school picker.
        .then((schools) => settle(schools[0] ? { status: 'found', school: schools[0], schools } : { status: 'denied' }))
        .catch(() => settle({ status: 'denied' }));
    }
    return () => {
      active = false;
    };
    // `list` is a method of `repository`, so the repository is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, userId, refreshKey]);
  if (!userId) return { status: 'denied' };
  return answer?.userId === userId ? answer.result : { status: 'loading' };
}

// Whether the user may open the school console. Memberships arrive with a sync, so the caller changes `refreshKey` to look again.
export function useAdminSchool(
  repository: StaffSchoolRepository,
  userId: string | undefined,
  refreshKey?: unknown,
): AdminSchoolResult {
  const result = useFirstSchool((id) => repository.listAdminSchools(id), repository, userId, refreshKey);
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
