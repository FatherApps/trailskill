import { useCallback, useEffect, useRef, useState } from 'react';

import type { AuthorizationStatusRepository } from '../../accounts';
import { AthleteResultSharingRow } from '../components/AthleteResultSharingRow';
import type { AthleteResultSharingRepository } from '../data/athleteResultSharing';
import type { AthleteSchoolRepository } from '../data/athleteSchools';

export type AthleteResultSharingContainerProps = {
  athleteId: string;
  schoolLinks: AthleteSchoolRepository;
  // Satisfied by the school console's repository: the names of the schools.
  schoolNames: { listByIds(ids: readonly string[]): Promise<{ id: string; name: string }[]> };
  authorizations: AuthorizationStatusRepository;
  sharing: AthleteResultSharingRepository;
  // Changes when a sync lands; the device is read again.
  syncKey?: number | null;
};

type Loaded = { athleteId: string; schools: { id: string; name: string }[]; shared: string[] };

// The owner's switch per school on the swimmer's profile. The route passes this only to who manages the swimmer, never to school staff
// or another family; here it shows only while the swimmer is active in two or more schools and the share_results_with_school
// authorization is in force. What it shows is the local table; a change is online only and goes back when the server refuses it.
export function AthleteResultSharingContainer({ athleteId, schoolLinks, schoolNames, authorizations, sharing, syncKey }: AthleteResultSharingContainerProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  // The schools with a change on the way: a second tap on one is ignored, and a read in the meantime does not undo the choice.
  const pending = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    (async (): Promise<Loaded | null> => {
      const [activeSchools, granted, shared] = await Promise.all([
        schoolLinks.listActiveSchools(athleteId),
        authorizations.listGrantedAthleteIds('share_results_with_school'),
        sharing.listSharedSchools(athleteId),
      ]);
      if (activeSchools.length < 2 || !granted.includes(athleteId)) return null;
      const names = await schoolNames.listByIds(activeSchools);
      return { athleteId, schools: names.map(({ id, name }) => ({ id, name })), shared };
    })()
      // A failed read shows nothing: the server decides who may share, and a missing section never opens anything.
      .catch(() => null)
      .then((result) => active && pending.current.size === 0 && setLoaded(result));
    return () => {
      active = false;
    };
  }, [athleteId, schoolLinks, schoolNames, authorizations, sharing, syncKey]);

  const toggle = useCallback(
    (schoolId: string, share: boolean) => {
      if (pending.current.has(schoolId)) return;
      pending.current.add(schoolId);
      setFailed(false);
      const set = (on: boolean) =>
        setLoaded((current) => current && { ...current, shared: on ? [...current.shared.filter((id) => id !== schoolId), schoolId] : current.shared.filter((id) => id !== schoolId) });
      set(share);
      (share ? sharing.grant(athleteId, schoolId) : sharing.revoke(athleteId, schoolId))
        .catch(() => {
          set(!share);
          setFailed(true);
        })
        .finally(() => pending.current.delete(schoolId));
    },
    [athleteId, sharing],
  );

  // Only this swimmer's own answer counts: a read of another one never shows here.
  if (loaded?.athleteId !== athleteId) return null;
  return (
    <AthleteResultSharingRow
      schools={loaded.schools.map((school) => ({ ...school, shared: loaded.shared.includes(school.id) }))}
      failed={failed}
      onToggle={toggle}
    />
  );
}
