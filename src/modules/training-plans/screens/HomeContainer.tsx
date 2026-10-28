import { useEffect, useState } from 'react';

import { t } from '../../../core/i18n';
import type { RecordSyncState } from '../../../core/sync';
import { athleteDisplay, type AthleteSchoolRepository, type HistoryRepository, type SchoolAthlete } from '../../athletes';
import type { SchoolNameRepository } from '../../school-console';
import { shiftDay, todayText, weekOf } from '../components/day';
import { athletesOfTarget, type AssignmentRepository } from '../data/assignments';
import type { TrainingPlanRepository } from '../data/plans';
import { eventLabel } from '../vocabulary';
import { ALL_ATHLETES, HomeScreen, type HomeContent, type HomeMark, type HomeNext, type HomeView } from './HomeScreen';

// shortcut: "Lo próximo" looks this many days ahead, one local read per day and school; upgrade with a query by date range if schools grow.
const NEXT_HORIZON_DAYS = 14;

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type HomeContainerProps = {
  plans: Pick<TrainingPlanRepository, 'get'>;
  assignments: Pick<AssignmentRepository, 'list'>;
  schoolLinks: AthleteSchoolRepository;
  history: Pick<HistoryRepository, 'listByAthlete'>;
  schoolNames: SchoolNameRepository;
  // The athletes the user manages; nobody else's plan or marks are ever read.
  athletes: SchoolAthlete[];
  // The first name of the person, when the device knows it.
  greetingName?: string;
  syncState: RecordSyncState;
  // Today as YYYY-MM-DD; the device's today when omitted.
  day?: string;
  // Whether the first sync completed; before it an empty list only means "not arrived yet". True when omitted.
  synced?: boolean;
  // Opens the plan of the day of an athlete.
  onOpenToday: (athleteId: string) => void;
};

type Next = Pick<HomeNext, 'title'> & { day: string };
// What was read for one athlete; the chip only chooses which of them show, so it never reads again.
type Read = { athlete: SchoolAthlete; schoolIds: string[]; next: Next | null; marks: (HomeMark & { capturedAt: string })[] };
type Loaded = { schoolName: string | null; reads: Read[] };

const longDay = (day: string) => {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const text = new Date(Date.UTC(year, month - 1, date)).toLocaleDateString('es-CO', { weekday: 'long', timeZone: 'UTC' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function whenLabel(day: string, today: string) {
  if (day === today) return t('training_plans.home.today');
  if (day === shiftDay(today, 1)) return t('training_plans.home.tomorrow');
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

async function read(props: HomeContainerProps, today: string): Promise<Loaded> {
  const { plans, assignments, schoolLinks, history, schoolNames, athletes } = props;
  const week = weekOf(today);
  const reads = await Promise.all(
    athletes.map(async (athlete): Promise<Read> => {
      const links = await schoolLinks.listByAthlete(athlete.id);
      let next: Next | null = null;
      for (let ahead = 0; ahead < NEXT_HORIZON_DAYS && !next; ahead++) {
        const day = shiftDay(today, ahead);
        for (const link of links) {
          const reached = { ...athlete, categoryId: link.categoryId };
          const assignment = (await assignments.list(link.schoolId, day)).find((a) => athletesOfTarget(a.target, [reached]).length > 0);
          const plan = assignment && (await plans.get(assignment.planId, assignment.versionId));
          if (plan) {
            next = { title: plan.name, day };
            break;
          }
        }
      }
      const { shortName, color } = athleteDisplay(athlete);
      const marks = (await history.listByAthlete(athlete.id))
        // A split is a part of a race, not a mark of its own.
        .filter((m) => m.hundredths !== null && m.kind !== 'split' && week.includes(todayText(new Date(m.capturedAt))))
        .map((m) => ({
          id: m.id,
          capturedAt: m.capturedAt,
          athleteName: shortName,
          event: eventLabel(m.stroke, m.distance),
          detail: t('training_plans.home.mark_detail', {
            day: longDay(todayText(new Date(m.capturedAt))),
            session: t(`training_plans.home.session_${m.sessionType}`),
          }),
          hundredths: m.hundredths!,
          color,
        }));
      return { athlete, schoolIds: links.map((link) => link.schoolId), next, marks };
    }),
  );
  // shortcut: with several schools the first by name shows; upgrade with one name per athlete.
  const names = await schoolNames.listByIds([...new Set(reads.flatMap((r) => r.schoolIds))]);
  return { schoolName: names[0]?.name ?? null, reads };
}

function contentOf(loaded: Loaded, selectedId: string, today: string): HomeContent {
  const shown = loaded.reads.filter(({ athlete }) => selectedId === ALL_ATHLETES || athlete.id === selectedId);
  // The earliest assignment among the athletes shown; on a tie, the first athlete.
  const soonest = shown.reduce<Read | null>((best, r) => (r.next && (!best?.next || r.next.day < best.next.day) ? r : best), null);
  const { shortName, color } = soonest ? athleteDisplay(soonest.athlete) : { shortName: '', color: 'athlete-1' as const };
  return {
    schoolName: loaded.schoolName,
    week: weekOf(today).map((day, index) => ({
      day,
      weekday: t(`training_plans.home.weekdays.${WEEKDAY_KEYS[index]}`),
      date: Number(day.slice(8)),
      today: day === today,
    })),
    next: soonest?.next
      ? { athleteId: soonest.athlete.id, athleteName: shortName, title: soonest.next.title, whenLabel: whenLabel(soonest.next.day, today), color }
      : null,
    marks: shown
      .flatMap((r) => r.marks)
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt) || a.id.localeCompare(b.id))
      .map(({ capturedAt: _capturedAt, ...mark }) => mark),
  };
}

// Container: reads the next plan and the marks of the week of the athletes the user manages from the local database.
export function HomeContainer(props: HomeContainerProps) {
  const { athletes, greetingName, syncState, onOpenToday } = props;
  const today = props.day ?? todayText();
  const synced = props.synced ?? true;
  const [chosenId, setChosenId] = useState(ALL_ATHLETES);
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ key: string; value: Loaded | 'error' }>();
  const ids = athletes.map((a) => a.id).join(',');
  const key = `${ids}|${today}|${attempt}`;

  useEffect(() => {
    if (!synced || athletes.length === 0) return;
    let current = true;
    read(props, today).then(
      (value) => current && setAnswer({ key, value }),
      () => current && setAnswer({ key, value: 'error' }),
    );
    return () => {
      current = false;
    };
    // The reads depend on the athletes, the day and the retry; the repositories are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, synced]);

  const selectedId = athletes.some((a) => a.id === chosenId) ? chosenId : ALL_ATHLETES;
  // An answer belongs to one set of athletes, day and attempt: under any other the screen starts from loading.
  const answered = answer?.key === key ? answer.value : undefined;
  const view: HomeView =
    athletes.length === 0
      ? synced
        ? { kind: 'data', content: contentOf({ schoolName: null, reads: [] }, ALL_ATHLETES, today) }
        : { kind: 'loading' }
      : answered === 'error'
        ? { kind: 'error', onRetry: () => setAttempt((n) => n + 1) }
        : answered
          ? { kind: 'data', content: contentOf(answered, selectedId, today) }
          : { kind: 'loading' };

  return (
    <HomeScreen
      view={view}
      greetingName={greetingName}
      athletes={athletes.map((athlete) => {
        const { shortName, initials, color } = athleteDisplay(athlete);
        return { id: athlete.id, name: shortName, initials, color };
      })}
      selectedId={selectedId}
      onSelect={setChosenId}
      syncState={syncState}
      onOpenToday={onOpenToday}
    />
  );
}
