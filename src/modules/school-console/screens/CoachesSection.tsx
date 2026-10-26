import { useEffect, useState } from 'react';

import type { SyncConnection } from '../../../core/sync';
import '../i18n';
import type { CoachRow } from '../components/CoachList';
import { localDate } from '../components/formatDate';
import type { Coach, CoachRepository } from '../data/coaches';
import { colorOf, type ConsoleAthlete, type ConsoleAthletesRepository } from '../data/consoleAthletes';
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
  // Both only report the press once the ConfirmSheet is confirmed; the real invitation and deactivation belong to the caller.
  onInvite: () => void;
  onDeactivate: (id: string) => void;
};

type Loaded = { coaches: Coach[]; groups: SchoolGroup[]; athletes: ConsoleAthlete[]; assignments: CoachAssignment[] };
// The answer is stored with what it answers, so another school or a retry never inherits it while its own read runs.
type Answer = { schoolId: string; attempt: number; result: Loaded | 'error' };

const MINUTE_MS = 60_000;
const defaultNow = () => new Date();

function toRow(coach: Coach, { groups, athletes, assignments }: Loaded): CoachRow {
  const assigned = new Set(assignments.filter((a) => a.coachId === coach.id && a.groupId !== null).map((a) => a.groupId));
  return {
    id: coach.id,
    name: coach.name,
    // Without a readable name there is nothing to take initials from.
    initials: '',
    color: colorOf(coach.id),
    groups: groups.filter((group) => assigned.has(group.id)).map((group) => group.name),
    athleteCount: athletes.filter((athlete) => athlete.coachIds.includes(coach.id)).length,
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
    Promise.all([repository.listCoaches(schoolId), structure.listGroups(schoolId), athletes.listAthletes(schoolId)])
      // No athlete ids: only the assignments to the school's groups, which are what the list shows.
      .then(async ([coaches, groups, list]) => settle({ coaches, groups, athletes: list, assignments: await structure.listCoachAssignments(schoolId, []) }))
      .catch(() => settle('error'));
    return () => {
      active = false;
    };
  }, [repository, structure, athletes, schoolId, refreshKey, attempt]);

  const loaded = answer?.schoolId === schoolId && answer.attempt === attempt ? answer.result : undefined;

  let view: CoachesView;
  // Empty before the first sync arrives is not "no coaches": the data may still be on its way.
  if (loaded === undefined || (connection === 'connecting' && lastSyncedAt === null && loaded !== 'error' && loaded.coaches.length === 0)) {
    view = { kind: 'loading' };
  } else if (loaded === 'error') {
    view = { kind: 'error', onRetry: () => setAttempt((n) => n + 1) };
  } else if (loaded.coaches.length === 0) {
    view = connection === 'offline' && lastSyncedAt === null ? { kind: 'offline-empty' } : { kind: 'empty' };
  } else {
    const content: CoachesContent = {
      updatedMinutesAgo: lastSyncedAt ? Math.max(0, Math.floor((now().getTime() - lastSyncedAt.getTime()) / MINUTE_MS)) : null,
      coaches: loaded.coaches.map((coach) => toRow(coach, loaded)),
    };
    // Without a connection the list is what the device stored; with no sync date the banner leaves the date out.
    view = connection !== 'offline' ? { kind: 'data', content } : { kind: 'offline', storedOn: lastSyncedAt ? localDate(lastSyncedAt) : '', content };
  }

  return <CoachesScreen width={width} schoolName={schoolName} view={view} onNavigate={onNavigate} onInvite={onInvite} onDeactivate={onDeactivate} />;
}
