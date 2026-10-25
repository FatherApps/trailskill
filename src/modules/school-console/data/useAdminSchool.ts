import { useEffect, useState } from 'react';

import type { StaffSchool, StaffSchoolRepository } from './staffSchools';

export type AdminSchoolResult = { status: 'loading' } | { status: 'denied' } | { status: 'admin'; school: StaffSchool };

// Whether the user may open the school console. Fails closed: no user or a failed lookup is a denial.
// Memberships arrive with a sync, so the caller changes `refreshKey` to look again.
export function useAdminSchool(
  repository: StaffSchoolRepository,
  userId: string | undefined,
  refreshKey?: unknown,
): AdminSchoolResult {
  // The answer is stored with the user who asked, so another user never inherits it while their own lookup runs.
  const [answer, setAnswer] = useState<{ userId: string; result: AdminSchoolResult }>();
  useEffect(() => {
    let active = true;
    if (userId) {
      const settle = (result: AdminSchoolResult) => active && setAnswer({ userId, result });
      repository
        .listAdminSchools(userId)
        // shortcut: takes the first admin school by name, no school picker; upgrade when an admin runs more than one school.
        .then((schools) => settle(schools[0] ? { status: 'admin', school: schools[0] } : { status: 'denied' }))
        .catch(() => settle({ status: 'denied' }));
    }
    return () => {
      active = false;
    };
  }, [repository, userId, refreshKey]);
  if (!userId) return { status: 'denied' };
  return answer?.userId === userId ? answer.result : { status: 'loading' };
}
