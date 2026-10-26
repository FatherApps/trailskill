import { useEffect, useState } from 'react';

import type { SyncConnection } from '../../../core/sync';
import '../i18n';
import type { CoachRow } from '../components/CoachList';
import { kindOf } from '../components/errorKind';
import { localDate } from '../components/formatDate';
import type { InviteGroups } from '../components/InviteCoachSheet';
import type { CoachInvitationRepository } from '../data/coachInvitations';
import type { Coach, CoachRepository } from '../data/coaches';
import { colorOf, countAthletesByCoach, type ConsoleAthletesRepository } from '../data/consoleAthletes';
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
  // Where the invitations go. Without it «Invitar» is shown disabled as «Próximamente»: never a button that seems to work.
  // `invite` must reject when the invitation fails, or the sheet closes as if it had been sent.
  invitations?: CoachInvitationRepository;
  // The real deactivation belongs to the caller; it only reports the press once the ConfirmSheet is confirmed, and stays disabled until issue 220.
  onDeactivate: (id: string) => void;
};

// `null` is a read that failed: what it feeds is left out of the cards, never shown as no groups or 0 athletes.
type Loaded = { coaches: Coach[]; groups: SchoolGroup[]; athleteCounts: Map<string, number> | null; assignments: CoachAssignment[] | null };
// The answer is stored with what it answers, so another school or a retry never inherits it while its own read runs.
type Answer = { schoolId: string; attempt: number; result: Loaded | 'error' };

const MINUTE_MS = 60_000;
const defaultNow = () => new Date();

// The group ids of each coach, built once per read; null when the assignments could not be read.
function indexByCoach({ assignments }: Loaded) {
  if (assignments === null) return null;
  const groupIds = new Map<string, Set<string>>();
  for (const { coachId, groupId } of assignments) {
    if (groupId !== null) groupIds.set(coachId, (groupIds.get(coachId) ?? new Set<string>()).add(groupId));
  }
  return groupIds;
}

type Read<T> = { ok: true; value: T } | { ok: false };
const READS = ['coaches', 'groups', 'athleteCounts', 'assignments'];

function toRow(coach: Coach, groups: SchoolGroup[], athleteCounts: Loaded['athleteCounts'], groupIds: ReturnType<typeof indexByCoach>): CoachRow {
  const assigned = groupIds?.get(coach.id);
  return {
    id: coach.id,
    name: coach.name,
    // Without a readable name there is nothing to take initials from.
    initials: '',
    color: colorOf(coach.id),
    status: 'active',
    groups: groupIds === null ? null : groups.filter((group) => assigned?.has(group.id)).map((group) => group.name),
    athleteCount: athleteCounts === null ? null : (athleteCounts.get(coach.id) ?? 0),
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
  invitations,
  onDeactivate,
}: CoachesSectionProps) {
  const [answer, setAnswer] = useState<Answer>();
  const [attempt, setAttempt] = useState(0);
  // The groups read again from the invite sheet alone, stored with the load it answers: any other load drops it.
  const [retried, setRetried] = useState<{ base: Answer | undefined; groups: SchoolGroup[] | 'error' }>();

  useEffect(() => {
    let active = true;
    const settle = (result: Answer['result']) => active && setAnswer({ schoolId, attempt, result });
    const failures = new Map<string, string>();
    // A failed read does not reject: it is noted by name and kind, and the rest of the load goes on.
    const attemptRead = <T,>(read: string, pending: Promise<T>): Promise<Read<T>> =>
      pending.then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => {
          failures.set(read, kindOf(error));
          return { ok: false as const };
        },
      );
    const athleteGroups = attemptRead('athleteCounts', athletes.listAthleteGroups(schoolId));
    Promise.all([
      attemptRead('coaches', repository.listCoaches(schoolId)),
      attemptRead('groups', structure.listGroups(schoolId)),
      athleteGroups,
      // The athlete ids bring the direct assignments to the same read; without them the group assignments, which are what the list shows, are still read.
      athleteGroups.then((read) => attemptRead('assignments', structure.listCoachAssignments(schoolId, read.ok ? read.value.map((athlete) => athlete.id) : []))),
    ]).then(([coaches, groups, athleteList, assignments]) => {
      if (!active) return;
      // Not behind __DEV__: in release this is the only trace. One line per load, whatever number of reads failed.
      if (failures.size > 0) {
        console.warn(`[school-console] Coaches could not be loaded: ${READS.filter((read) => failures.has(read)).map((read) => `${read}=${failures.get(read)}`).join(', ')}`);
      }
      // The coaches and the groups are the list itself; the athletes and the assignments only complete each card.
      if (!coaches.ok || !groups.ok) return settle('error');
      settle({
        coaches: coaches.value,
        groups: groups.value,
        assignments: assignments.ok ? assignments.value : null,
        athleteCounts: athleteList.ok && assignments.ok ? countAthletesByCoach(athleteList.value, groups.value, assignments.value) : null,
      });
    });
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
  const groups: InviteGroups = loaded === undefined ? 'loading' : retried !== undefined && retried.base === answer ? retried.groups : loaded === 'error' ? 'error' : loaded.groups;
  // Only the groups: the coaches, the athletes and the assignments are not read again.
  const retryGroups = () => {
    const base = answer;
    structure.listGroups(schoolId).then(
      (read) => setRetried({ base, groups: read }),
      (error: unknown) => {
        console.warn(`[school-console] Coaches could not be loaded: groups=${kindOf(error)}`);
        setRetried({ base, groups: 'error' });
      },
    );
  };

  return <CoachesScreen width={width} schoolName={schoolName} view={view} groups={groups} onNavigate={onNavigate} onRetryGroups={retryGroups} inviteAvailable={invitations !== undefined} onInvite={(invitation) => invitations?.invite(schoolId, invitation)} onDeactivate={onDeactivate} />;
}
