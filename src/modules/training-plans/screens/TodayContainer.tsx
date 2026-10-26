import { useEffect, useState, type ReactNode } from 'react';

import type { Hundredths } from '../../../core/time';
import { athleteDisplay, type AthleteSchoolRepository, type SchoolAthlete } from '../../athletes';
import type { SeriesRepository } from '../../timing';
import { todayText } from '../components/day';
import { athletesOfTarget, type AssignmentRepository } from '../data/assignments';
import type { FulfillmentMark, FulfillmentRepository } from '../data/fulfillment';
import type { Notice, NoticeRepository } from '../data/notices';
import type { TrainingPlanRepository } from '../data/plans';
import { planVocabulary } from '../vocabulary';
import { TodayScreen, type TodayContent, type TodayView } from './TodayScreen';

export type TodayContainerProps = {
  plans: TrainingPlanRepository;
  assignments: AssignmentRepository;
  schoolLinks: AthleteSchoolRepository;
  fulfillment: FulfillmentRepository;
  notices: NoticeRepository;
  // The public API of timing: the arrivals of a series are the times of a block.
  series: Pick<SeriesRepository, 'listArrivals'>;
  userId: string;
  // The athletes the user manages; nobody else's plan is ever read.
  athletes: SchoolAthlete[];
  // The athlete shown first, when it is one of `athletes`.
  initialAthleteId?: string;
  // Today as YYYY-MM-DD; the device's today when omitted.
  day?: string;
  // Whether the first sync completed; before it an empty list only means "not arrived yet". True when omitted.
  synced?: boolean;
  // Opens "Mis deportistas", offered when the user manages no athlete yet.
  onOpenAthletes?: () => void;
  renderNoticeStatus?: (noticeId: string) => ReactNode;
};

type Loaded = { content: TodayContent; assignmentId: string; versionId: string };
// What was read for one athlete: the answer is stored with it, so it never shows under another athlete's name.
type Answer = { athleteId: string; value: Loaded | null | 'error' };

type SeriesArrivals = Awaited<ReturnType<TodayContainerProps['series']['listArrivals']>>;

// per_repetition: one entry per repetition, "not recorded" (null) where the series has no time; series_total: at most one; completion: none.
function timesOf(recording: string, repetitions: number, mark: FulfillmentMark | undefined, arrivals: SeriesArrivals): (Hundredths | null)[] | undefined {
  if (recording === 'per_repetition') return Array.from({ length: repetitions }, (_, index) => arrivals[index]?.hundredths ?? null);
  if (recording === 'series_total' && mark?.seriesId && arrivals.length > 0) return [arrivals[0].hundredths ?? null];
  return undefined;
}

const notesOf = (list: Notice[]) =>
  list.map((n) => ({ id: n.id, body: n.body, blockId: n.blockId, dateLabel: new Date(n.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) }));

function viewOf(athletes: SchoolAthlete[], synced: boolean, selected: SchoolAthlete | undefined, loaded: Loaded | null | 'loading' | 'error', actions: { onOpenAthletes?: () => void; onRetry: () => void }): TodayView {
  if (athletes.length === 0) return synced ? { kind: 'no-athletes', onOpenAthletes: actions.onOpenAthletes } : { kind: 'loading' };
  if (!selected || loaded === null) return { kind: 'empty' };
  if (loaded === 'loading') return { kind: 'loading' };
  if (loaded === 'error') return { kind: 'error', onRetry: actions.onRetry };
  return { kind: 'data', content: loaded.content };
}

// Container: reads the plan of the day of one athlete from the local database and saves the user's notes to the coach on the device at once.
export function TodayContainer(props: TodayContainerProps) {
  const { plans, assignments, schoolLinks, fulfillment, notices, series, userId, athletes, initialAthleteId, renderNoticeStatus } = props;
  const day = props.day ?? todayText();
  // Only the person's choice is kept; the athlete shown is derived, so it follows `athletes`: the chosen one while it is in the list, else the first.
  const [chosenId, setChosenId] = useState(initialAthleteId);
  const [answer, setAnswer] = useState<Answer>();
  const [attempt, setAttempt] = useState(0);
  const selected = athletes.find((a) => a.id === chosenId) ?? athletes[0];
  const selectedId = selected?.id;
  const loaded = answer && answer.athleteId === selectedId ? answer.value : 'loading';
  // The short name only, never the document or the birth date.
  const names = athletes.map((athlete) => {
    const { shortName, initials, color } = athleteDisplay(athlete);
    return { id: athlete.id, name: shortName, initials, color };
  });
  const athleteName = names.find((n) => n.id === selectedId)?.name ?? '';

  async function load(athlete: SchoolAthlete): Promise<Loaded | null> {
    // shortcut: with several assignments today (or in several schools) the first, oldest one shows; upgrade with a plan picker.
    for (const link of await schoolLinks.listByAthlete(athlete.id)) {
      // The link's own category: the athlete's category is the smallest one among all its schools.
      const reached = { ...athlete, categoryId: link.categoryId };
      const assignment = (await assignments.list(link.schoolId, day)).find((a) => athletesOfTarget(a.target, [reached]).length > 0);
      if (!assignment) continue;
      // The assignment's own version, so the blocks are those the coach assigned.
      const [plan, marks, list] = await Promise.all([plans.get(assignment.planId, assignment.versionId), fulfillment.list(assignment.id), notices.list(athlete.id, assignment.id)]);
      if (!plan) continue;
      const arrivalsBySeries = new Map(
        await Promise.all(
          [...new Set(marks.filter((m) => m.athleteId === athlete.id && m.seriesId).map((m) => m.seriesId!))].map(async (id) => [id, await series.listArrivals(id)] as const),
        ),
      );
      const blocks = plan.blocks.map((block) => {
        const mark = marks.find((m) => m.athleteId === athlete.id && m.blockId === block.id);
        const arrivals = (mark?.seriesId ? (arrivalsBySeries.get(mark.seriesId) ?? []) : []).filter((arrival) => arrival.athleteId === athlete.id);
        const times = timesOf(block.recording, block.repetitions, mark, arrivals);
        return {
          block,
          status: mark?.status ?? ('not_marked' as const),
          ...(mark?.completedRepetitions != null && { completedRepetitions: mark.completedRepetitions }),
          ...(times && { times }),
        };
      });
      return {
        assignmentId: assignment.id,
        versionId: assignment.versionId,
        content: {
          planName: plan.name,
          blocks,
          vocabulary: planVocabulary(),
          planChanged: assignment.versionChanged,
          notes: notesOf(list),
        },
      };
    }
    return null;
  }

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    load(selected).then(
      (value) => !cancelled && setAnswer({ athleteId: selected.id, value }),
      () => !cancelled && setAnswer({ athleteId: selected.id, value: 'error' }),
    );
    return () => {
      cancelled = true;
    };
    // The repositories are fixed for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, day, attempt]);

  async function sendNotice({ blockId, body }: { blockId: string | null; body: string }) {
    if (!selected || typeof loaded !== 'object' || loaded === null) return;
    // The note is saved on the device first, so it never waits for the network.
    await notices.add({ athleteId: selected.id, assignmentId: loaded.assignmentId, versionId: loaded.versionId, blockId, body, authorId: userId });
    const list = await notices.list(selected.id, loaded.assignmentId);
    setAnswer({ athleteId: selected.id, value: { ...loaded, content: { ...loaded.content, notes: notesOf(list) } } });
  }

  // The shown data is dropped at once, so the plan of the previous athlete never stays under the new name.
  function reload(id = selectedId) {
    setAnswer(undefined);
    setChosenId(id);
    setAttempt((n) => n + 1);
  }

  const view = viewOf(athletes, props.synced ?? true, selected, loaded, { onOpenAthletes: props.onOpenAthletes, onRetry: () => reload() });

  return (
    <TodayScreen
      athleteName={athleteName}
      view={view}
      athletes={names}
      selectedAthleteId={selectedId}
      onSelectAthlete={reload}
      onSendNotice={sendNotice}
      renderNoticeStatus={renderNoticeStatus}
    />
  );
}
