import { useEffect, useMemo, useState } from 'react';

import type { ImportPromptProps } from '../components/ImportPrompt';
import type { AthleteSchoolRepository } from './athleteSchools';
import type { SchoolAthlete } from './schoolAthletes';
import type { ManagedAthletesResult } from './useManagedAthletes';

// What this hook needs from the other modules, typed here by shape: `athletes` never imports them (accounts, results-import
// and school-console already import `athletes`). The route passes the real repositories and hook results.
export type AthleteProfileRouteInput = {
  athleteId: string;
  /** Changes when a sync lands; the lookups run again. */
  syncedAt: number | undefined;
  importedResults: { lastImportedAt(athleteId: string): Promise<string | null> };
  identity: { isConfirmed(athleteId: string): Promise<boolean> };
  schoolLinks: AthleteSchoolRepository;
  staff: { status: 'staff'; schools: { id: string }[] } | { status: 'loading' | 'denied' | 'error' };
  sources: { kind: 'federation' | 'platform'; name: string; provider: string }[];
  managed: ManagedAthletesResult;
  onImport: () => void;
  onImportTournament: () => void;
};

export type AthleteProfileRouteState = {
  started: boolean;
  isStaff: boolean;
  /** The school whose choice of what the guardian sees the screen shows. */
  sharingSchoolId: string | undefined;
  sourceNames: Record<string, string>;
  sessionDated: string[];
  managedAthlete: SchoolAthlete | undefined;
  importPrompt: ImportPromptProps | undefined;
};

// The state the athlete profile route used to keep: whether the guardian has started importing, which school's sharing
// choice applies, and the invitation to import. Lookups failing leave the defaults: the backend decides who sees what.
export function useAthleteProfileRoute({
  athleteId,
  syncedAt,
  importedResults,
  identity,
  schoolLinks,
  staff,
  sources,
  managed,
  onImport,
  onImportTournament,
}: AthleteProfileRouteInput): AthleteProfileRouteState {
  const [importDismissed, setImportDismissed] = useState(false);
  // The invitation is only for a guardian who has not started: once the identity is confirmed or something was imported, the
  // results panel takes over (updating is its button), even before the first import.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([importedResults.lastImportedAt(athleteId).catch(() => null), identity.isConfirmed(athleteId)]).then(
      ([at, confirmed]) => active && setStarted(at !== null || confirmed),
    );
    return () => {
      active = false;
    };
  }, [athleteId, syncedAt, importedResults, identity]);
  const isStaff = staff.status === 'staff';
  // The school whose choice of what the guardian sees this screen shows: the first school of the user that the swimmer belongs to.
  const [swimmerSchoolIds, setSwimmerSchoolIds] = useState<{ athleteId: string; ids: string[] }>();
  useEffect(() => {
    let active = true;
    schoolLinks.listByAthlete(athleteId).then(
      (links) => active && setSwimmerSchoolIds({ athleteId, ids: links.map((link) => link.schoolId) }),
      () => active && setSwimmerSchoolIds({ athleteId, ids: [] }),
    );
    return () => {
      active = false;
    };
  }, [athleteId, syncedAt, schoolLinks]);
  const sharingSchoolId =
    staff.status === 'staff' && swimmerSchoolIds?.athleteId === athleteId ? staff.schools.find((school) => swimmerSchoolIds.ids.includes(school.id))?.id : undefined;

  // The organization behind each imported result, from data; without a connection the marks show the generic origin.
  const sourceNames = useMemo(() => Object.fromEntries(sources.map((source) => [source.provider, source.name])), [sources]);
  // A results platform dates each result by its session: that date wins when two sources hold the same swim.
  const sessionDated = useMemo(() => sources.filter((source) => source.kind === 'platform').map((source) => source.provider), [sources]);

  // Only a guardian or an adult athlete is offered the import; the source's name comes from data.
  const managedAthlete = managed.status === 'ready' ? managed.athletes.find((candidate) => candidate.id === athleteId) : undefined;
  // The federation is searched by person; a results platform is reached by the address of one tournament.
  const federation = sources.find((source) => source.kind === 'federation');
  const hasPlatform = sources.some((source) => source.kind === 'platform');
  const importPrompt =
    managedAthlete && ((federation && !started) || hasPlatform) && !importDismissed
      ? {
          sourceName: federation && !started ? federation.name : undefined,
          athleteName: managedAthlete.firstName,
          imported: false,
          onDismiss: () => setImportDismissed(true),
          // Never shown while `imported` is false; the update lives in the results panel.
          onRefresh: () => undefined,
          onStart: onImport,
          onStartTournament: hasPlatform ? onImportTournament : undefined,
        }
      : undefined;

  return { started, isStaff, sharingSchoolId, sourceNames, sessionDated, managedAthlete, importPrompt };
}
