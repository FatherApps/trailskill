import { useEffect, useState, type ReactNode } from 'react';

import { t } from '../../../core/i18n';
import { useFirstScreenReady, useStartupMark } from '../../../core/startup';
import type { SyncConnection } from '../../../core/sync';
import type { AthleteAvatarSlot } from '../../../core/ui';
import '../i18n';
import { avatarOf } from '../components/athleteAvatar';
import { personalBestLabel } from '../components/eventLabel';
import { CONSOLE_BEST_EVENT, type ConsoleAthlete, type ConsoleAthletesRepository } from '../data/consoleAthletes';
import { MySwimmersScreen, type MySwimmerRow, type MySwimmersView } from './MySwimmersScreen';

export type MySwimmersSectionProps = {
  // Injected by the route (this module cannot read show_photo or the photo): the athletes' avatar with their photo. Absent: the initials.
  Avatar?: AthleteAvatarSlot;
  width: number;
  schoolName: string;
  schoolId: string;
  // The coach: only the athletes assigned to this user, directly or by group, are listed.
  coachUserId: string;
  repository: Pick<ConsoleAthletesRepository, 'listAthletes'>;
  // The list is read again when this changes (a sync completed).
  refreshKey?: unknown;
  // When the local database last finished a sync; `null` when it never did.
  lastSyncedAt: Date | null;
  // 'connecting' is not 'offline': PowerSync is still reaching the backend, so nothing says the device lacks a network yet.
  connection: SyncConnection;
  onOpenAthlete: (id: string, name: string) => void;
  onBack?: () => void;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
  footer?: ReactNode;
};

// The answer is stored with what it answers, so another coach or a retry never inherits it while its own read runs.
type Answer = { schoolId: string; coachUserId: string; attempt: number; result: ConsoleAthlete[] | 'error' };

const toRow = (athlete: ConsoleAthlete, Avatar: AthleteAvatarSlot | undefined): MySwimmerRow => ({
  id: athlete.id,
  name: athlete.name,
  initials: athlete.initials,
  color: athlete.color,
  detail: [athlete.category, ...(athlete.groups.length > 0 ? [athlete.groups.join(', ')] : [])].join(' · ') || t('schoolConsole.common.no_data'),
  bestTime: athlete.bestTime,
  avatar: avatarOf(Avatar, athlete),
});

// The swimmers of one coach, read from the local database. The device only holds what the sync gave it, but a coach can also be a guardian
// of athletes of the same school, so the list is cut to the assignments: nobody else's athlete is shown, whatever is on the device.
export function MySwimmersSection({
  Avatar,
  width,
  schoolName,
  schoolId,
  coachUserId,
  repository,
  refreshKey,
  lastSyncedAt,
  connection,
  onOpenAthlete,
  onBack,
  scrollEnabled,
  footer,
}: MySwimmersSectionProps) {
  const [answer, setAnswer] = useState<Answer>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const settle = (result: Answer['result']) => active && setAnswer({ schoolId, coachUserId, attempt, result });
    repository.listAthletes(schoolId).then(
      (athletes) => settle(athletes.filter((a) => a.coachIds.includes(coachUserId))),
      () => settle('error'),
    );
    return () => {
      active = false;
    };
  }, [repository, schoolId, coachUserId, refreshKey, attempt]);

  const loaded = answer?.schoolId === schoolId && answer.coachUserId === coachUserId && answer.attempt === attempt ? answer.result : undefined;
  useStartupMark('my_swimmers_painted', loaded !== undefined);
  useFirstScreenReady(loaded !== undefined);
  let view: MySwimmersView;
  if (loaded === undefined) view = { kind: 'loading' };
  else if (loaded === 'error') view = { kind: 'error', onRetry: () => setAttempt((n) => n + 1) };
  else if (loaded.length > 0) {
    view = {
      kind: 'data',
      swimmers: loaded.map((athlete) => toRow(athlete, Avatar)),
      bestLabel: personalBestLabel(CONSOLE_BEST_EVENT.stroke, CONSOLE_BEST_EVENT.distance, CONSOLE_BEST_EVENT.pool),
    };
  } else {
    // Never synced and still not connected: nothing is stored yet, and the list fills in when the first sync arrives.
    view =
      lastSyncedAt !== null || connection === 'connected'
        ? { kind: 'empty' }
        : connection === 'connecting'
          ? { kind: 'connecting-empty' }
          : { kind: 'offline-empty' };
  }

  return (
    <MySwimmersScreen
      width={width}
      schoolName={schoolName}
      view={view}
      onOpen={onOpenAthlete}
      onBack={onBack}
      scrollEnabled={scrollEnabled}
      footer={footer}
    />
  );
}
