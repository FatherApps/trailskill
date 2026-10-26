import { useEffect, useState } from 'react';

import type { SyncConnection } from '../../../core/sync';
import '../i18n';
import type { CoachRow } from '../components/CoachList';
import { localDate } from '../components/formatDate';
import type { CoachInvitation, InviteGroups } from '../components/InviteCoachSheet';
import type { Coach, CoachRepository } from '../data/coaches';
import { colorOf, type ConsoleAthletesRepository } from '../data/consoleAthletes';
import type { CoachAssignment, SchoolGroup, SchoolStructureRepository } from '../data/schoolStructure';
import { CoachesScreen, type CoachesContent, type CoachesView } from './CoachesScreen';
import type { ConsoleSectionProps } from './ConsoleScreen';

export type CoachesSectionProps = ConsoleSectionProps & {
  schoolId: string;
  repository: CoachRepository;
  structure: SchoolStructureRepository;
  athletes: ConsoleAthletesRepository;
  // Everything is read again when this changes (a sync completed).
  refreshKey?: unknown;
  // When the local database last finished a sync; `null` when it never did.
  lastSyncedAt: Date | null;
  // 'connecting' is not 'offline': PowerSync is still reaching the backend, so nothing says the device lacks a network yet.
  connection: SyncConnection;
  // The clock. A stable function: the caption is computed again when it changes.
  now?: () => Date;
  // The real invitation and deactivation belong to the caller; deactivating only reports the press once the ConfirmSheet is confirmed.
  // `onInvite` goes to the sheet as it is: it must reject when the invitation fails, or the sheet closes as if it had been sent.
  onInvite: (invitation: CoachInvitation) => void | Promise<void>;
  onDeactivate: (id: string) => void;
};

type Loaded = { coaches: Coach[]; groups: SchoolGroup[]; athleteCounts: Map<string, number>; assignments: CoachAssignment[] };
// The answer is stored with what it answers, so another school or a retry never inherits it while its own read runs.
type Answer = { schoolId: string; attempt: number; result: Loaded | 'error' };

const MINUTE_MS = 60_000;
const defaultNow = () => new Date();

// The group ids of each coach, built once per read.
function indexByCoach({ assignments }: Loaded) {
  const groupIds = new Map<string, Set<string>>();
  for (const { coachId, groupId } of assignments) {
    if (groupId !== null) groupIds.set(coachId, (groupIds.get(coachId) ?? new Set<string>()).add(groupId));
  }
  return groupIds;
}

// Names the read that failed. Not behind __DEV__: in release this is the only trace. Only the kind of the error, never its message, which can carry stored data.
function traced<T>(read: string, pending: Promise<T>) {
  return pending.catch((error: unknown) => {
    console.error(`[school-console] Coaches could not be loaded: ${read} read failed`, error instanceof Error ? error.name : typeof error);
    throw error;
  });
}

function toRow(coach: Coach, groups: SchoolGroup[], athleteCounts: Map<string, number>, groupIds: ReturnType<typeof indexByCoach>): CoachRow {
  const assigned = groupIds.get(coach.id);
  return {
    id: coach.id,
    name: coach.name,
    // Without a readable name there is nothing to take initials from.
    initials: '',
    color: colorOf(coach.id),
    groups: groups.filter((group) => assigned?.has(group.id)).map((group) => group.name),
    athleteCount: athleteCounts.get(coach.id) ?? 0,
  };
}

// The coaches of the school with their groups and athletes, read from the local database.
export function CoachesSection({
  width,
  schoolName,
  onNavigate,
  schoolId,
  repository,
  structure,
  athletes,
  refreshKey,
  lastSyncedAt,
  connection,
  now = defaultNow,
  onInvite,
  onDeactivate,
}: CoachesSectionProps) {
  const [answer, setAnswer] = useState<Answer>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const settle = (result: Answer['result']) => active && setAnswer({ schoolId, attempt, result });
    // All or nothing, for now: if one read fails the list is not shown with the rest, since what is missing would read as zero athletes or no groups.
    Promise.all([
      traced('coaches', repository.listCoaches(schoolId)),
      traced('groups', structure.listGroups(schoolId)),
      traced('athleteCounts', athletes.countAthletesByCoach(schoolId)),
      // No athlete ids: only the assignments to the school's groups, which are what the list shows.
      traced('assignments', structure.listCoachAssignments(schoolId, [])),
    ])
      .then(([coaches, groups, athleteCounts, assignments]) => settle({ coaches, groups, athleteCounts, assignments }))
      .catch(() => settle('error'));
    return () => {
      active = false;
    };
  }, [repository, structure, athletes, schoolId, refreshKey, attempt]);

  const loaded = answer?.schoolId === schoolId && answer.attempt === attempt ? answer.result : undefined;

  let view: CoachesView;
  if (loaded === undefined) {
    view = { kind: 'loading' };
  } else if (loaded === 'error') {
    view = { kind: 'error', onRetry: () => setAttempt((n) => n + 1) };
  } else if (loaded.coaches.length === 0) {
    // Never synced: nothing is stored yet, and the list fills in when the first sync arrives. 'connecting' is not 'offline': the sync is already on its way.
    view =
      lastSyncedAt !== null || connection === 'connected'
        ? { kind: 'empty' }
        : connection === 'connecting'
          ? { kind: 'connecting-empty' }
          : { kind: 'offline-empty' };
  } else {
    const groupIds = indexByCoach(loaded);
    const content: CoachesContent = {
      updatedMinutesAgo: lastSyncedAt ? Math.max(0, Math.floor((now().getTime() - lastSyncedAt.getTime()) / MINUTE_MS)) : null,
      coaches: loaded.coaches.map((coach) => toRow(coach, loaded.groups, loaded.athleteCounts, groupIds)),
    };
    // Without a connection the list is what the device stored; with no sync date the banner leaves the date out.
    view = connection !== 'offline' ? { kind: 'data', content } : { kind: 'offline', storedOn: lastSyncedAt ? localDate(lastSyncedAt) : '', content };
  }

  // The groups feed the invite sheet's chips; while they are read or failed the sheet is told so, not given an empty list. «Desactivar» stays disabled (the screen's default) until issue 220.
  const groups: InviteGroups = loaded === undefined ? 'loading' : loaded === 'error' ? 'error' : loaded.groups;

  return <CoachesScreen width={width} schoolName={schoolName} view={view} groups={groups} onNavigate={onNavigate} onRetryGroups={() => setAttempt((n) => n + 1)} onInvite={onInvite} onDeactivate={onDeactivate} />;
}
