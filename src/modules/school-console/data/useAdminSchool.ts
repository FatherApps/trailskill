import { useEffect, useState } from 'react';

import type { StaffSchool, StaffSchoolRepository } from './staffSchools';

export type AdminSchoolResult = { status: 'loading' } | { status: 'denied' } | { status: 'admin'; school: StaffSchool };
export type StaffSchoolResult = { status: 'loading' } | { status: 'denied' } | { status: 'staff'; school: StaffSchool };

// Looks up the schools of a user and keeps the first one. Fails closed: no user or a failed lookup is a denial.
// The answer is stored with the user who asked, so another user never inherits it while their own lookup runs.
function useFirstSchool(
  list: (userId: string) => Promise<StaffSchool[]>,
  repository: StaffSchoolRepository,
  userId: string | undefined,
  refreshKey: unknown,
): { status: 'loading' } | { status: 'denied' } | { status: 'found'; school: StaffSchool } {
  const [answer, setAnswer] = useState<{ userId: string; result: { status: 'denied' } | { status: 'found'; school: StaffSchool } }>();
  useEffect(() => {
    let active = true;
    if (userId) {
      const settle = (result: { status: 'denied' } | { status: 'found'; school: StaffSchool }) =>
        active && setAnswer({ userId, result });
      list(userId)
        // shortcut: takes the first school by name, no school picker; upgrade when a person runs more than one school.
        .then((schools) => settle(schools[0] ? { status: 'found', school: schools[0] } : { status: 'denied' }))
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
  return result.status === 'found' ? { status: 'staff', school: result.school } : result;
}
