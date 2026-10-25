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
  const [result, setResult] = useState<AdminSchoolResult>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    if (userId) {
      repository
        .listAdminSchools(userId)
        // shortcut: takes the first admin school by name, no school picker; upgrade when an admin runs more than one school.
        .then((schools) => active && setResult(schools[0] ? { status: 'admin', school: schools[0] } : { status: 'denied' }))
        .catch(() => active && setResult({ status: 'denied' }));
    }
    return () => {
      active = false;
    };
  }, [repository, userId, refreshKey]);
  return userId ? result : { status: 'denied' };
}
