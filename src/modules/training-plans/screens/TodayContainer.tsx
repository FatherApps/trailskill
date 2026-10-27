import { useEffect, useRef, useState, type ReactNode } from 'react';

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
  // Whether the device cannot reach the backend; before the first sync an empty list then means "no connection yet", not "still arriving".
  offline?: boolean;
  // Opens "Mis deportistas", offered when the user manages no athlete yet.
  onOpenAthletes?: () => void;
  // Whether the caller is still deciding `onOpenAthletes`; the message without athletes waits for it, so it never shows without an exit and then gains one.
  actionPending?: boolean;
  // Set when the caller could not decide `onOpenAthletes` because its lookup failed: without athletes, the error view with this retry shows instead of the message.
  onRetryAction?: () => void;
  renderNoticeStatus?: (noticeId: string) => ReactNode;
};

type Loaded = { content: TodayContent; assignmentId: string; versionId: string };
// What was read for one athlete: the answer is stored with it, so it never shows under another athlete's name.
type Answer = { athleteId: string; value: Loaded | null | 'error' };

type Flight = {
  // How many notes were saved on the device.
  saved: number;
  // How many saves have not finished: only the last one to finish reads again, so overlapping saves share one read.
  saving: number;
  // A note was saved whose listing failed: the answer shown may lack it, and the save that finishes last reads again, even if it failed itself.
  unlisted: boolean;
};

// The athlete of a read, and the notes saved per assignment when it started (null once it answered). The day is not part of it: an assignment can be read under another day, so a save that finishes under one still reaches the read of another.
type Reading = { athleteId: string; since: Map<string, number> | null };

type SeriesArrivals = Awaited<ReturnType<TodayContainerProps['series']['listArrivals']>>;

// per_repetition: one entry per repetition, "not recorded" (null) where the series has no time; series_total: at most one; completion: none.
function timesOf(recording: string, repetitions: number, mark: FulfillmentMark | undefined, arrivals: SeriesArrivals): (Hundredths | null)[] | undefined {
  if (recording === 'per_repetition') return Array.from({ length: repetitions }, (_, index) => arrivals[index]?.hundredths ?? null);
  if (recording === 'series_total' && mark?.seriesId && arrivals.length > 0) return [arrivals[0].hundredths ?? null];
  return undefined;
}

const notesOf = (list: Notice[]) =>
  list.map((n) => ({ id: n.id, body: n.body, blockId: n.blockId, dateLabel: new Date(n.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) }));

function viewOf(athletes: SchoolAthlete[], synced: boolean, offline: boolean, loaded: Loaded | null | 'loading' | 'error', actions: { onOpenAthletes?: () => void; onRetryAction?: () => void; actionPending: boolean; onRetry: () => void }): TodayView {
  if (athletes.length === 0) {
    if (!synced) return offline ? { kind: 'offline-empty' } : { kind: 'loading' };
    if (actions.actionPending) return { kind: 'loading' };
    return actions.onRetryAction ? { kind: 'error', onRetry: actions.onRetryAction } : { kind: 'no-athletes', onOpenAthletes: actions.onOpenAthletes };
  }
  // Nothing found: after the first sync that is "no plan"; before it, offline says so and anything else is still connecting, so loading.
  if (loaded === null) return synced ? { kind: 'empty' } : offline ? { kind: 'offline-empty' } : { kind: 'loading' };
  if (loaded === 'loading') return { kind: 'loading' };
  if (loaded === 'error') return { kind: 'error', onRetry: actions.onRetry };
  return { kind: 'data', content: loaded.content };
}

// Container: reads the plan of the day of one athlete from the local database and saves the user's notes to the coach on the device at once.
export function TodayContainer(props: TodayContainerProps) {
  const { plans, assignments, schoolLinks, fulfillment, notices, series, userId, athletes, initialAthleteId, renderNoticeStatus } = props;
  const day = props.day ?? todayText();
  const synced = props.synced ?? true;
  // Only the first sync reads again: a connection that comes and goes afterwards must not restart the read each time.
  const [syncedOnce, setSyncedOnce] = useState(synced);
  if (synced && !syncedOnce) setSyncedOnce(true);
  // Only the choice is kept; the athlete shown is derived, so it follows `athletes`: the chosen one while it is in the list, else the first.
  const [chosenId, setChosenId] = useState(initialAthleteId);
  // The athlete of the link is a choice too: when it changes with the route mounted, it replaces the previous one.
  const [linkedId, setLinkedId] = useState(initialAthleteId);
  if (linkedId !== initialAthleteId) {
    setLinkedId(initialAthleteId);
    setChosenId(initialAthleteId);
  }
  const [answer, setAnswer] = useState<Answer>();
  const [attempt, setAttempt] = useState(0);
  // Reading again after a save does not change the key: the data stays on screen until the new read arrives, instead of going through loading.
  const [refreshes, setRefreshes] = useState(0);
  const selected = athletes.find((a) => a.id === chosenId) ?? athletes[0];
  const selectedId = selected?.id;
  // An answer belongs to one athlete, day and attempt: under any other, even one seen before, the screen starts from loading.
  const readKey = `${selectedId}|${day}|${attempt}`;
  const [answeredKey, setAnsweredKey] = useState(readKey);
  if (answeredKey !== readKey) {
    setAnsweredKey(readKey);
    setAnswer(undefined);
  }
  const loaded = answer ? answer.value : 'loading';
  // The read that is open or last ended, put by the read effect: the athlete it reads, and how many notes had been saved per assignment when it started (null: it already answered).
  // A read that started before a save finished may have listed the notes without it; one that started after cannot. A save of another assignment says nothing about it.
  // Null when nothing is read, so a save that finishes later than the render it started in refreshes only the athlete on the screen now.
  const reading = useRef<Reading | null>(null);
  // Per assignment, what its saves left in flight; the entry goes away when its last save finishes, unless a read is open (it compares against `saved`).
  const flights = useRef(new Map<string, Flight>());
  // Listings are numbered as they start; per assignment, the number of the last one shown. A listing that answers after a newer one was shown is older, so it is dropped.
  // The entry of `shownListing` always goes away when the last save of its assignment finishes; the one of `flights` stays while a read is open.
  const listingSeq = useRef(0);
  const shownListing = useRef(new Map<string, number>());
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
    // Set here whatever the path, so it never depends on the cleanup of the previous run having cleared it.
    if (!selected) {
      reading.current = null;
      return;
    }
    let cancelled = false;
    const mine: Reading = { athleteId: selected.id, since: new Map([...flights.current].map(([id, flight]) => [id, flight.saved])) };
    reading.current = mine;
    const answered = (value: Answer['value']) => {
      if (cancelled) return;
      mine.since = null;
      setAnswer({ athleteId: selected.id, value });
    };
    load(selected).then(answered, () => answered('error'));
    return () => {
      cancelled = true;
      reading.current = null;
    };
    // The repositories are fixed for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, day, attempt, syncedOnce, refreshes]);

  async function sendNotice({ blockId, body }: { blockId: string | null; body: string }) {
    if (!selected || typeof loaded !== 'object' || loaded === null) return;
    const { assignmentId } = loaded;
    const flight = () => {
      const current = flights.current.get(assignmentId) ?? { saved: 0, saving: 0, unlisted: false };
      flights.current.set(assignmentId, current);
      return current;
    };
    flight().saving += 1;
    try {
      // The note is saved on the device first, so it never waits for the network.
      // shortcut: a save that never ends has no timeout, so the form stays on 'sending' with the text kept; upgrade when the maintainer defines what the person sees when a save is cut (issue 625).
      await notices.add({ athleteId: selected.id, assignmentId, versionId: loaded.versionId, blockId, body, authorId: userId });
      flight().saved += 1;
      const ticket = (listingSeq.current += 1);
      let list: Notice[] | undefined;
      try {
        list = await notices.list(selected.id, assignmentId);
      } catch (error) {
        // The note is saved; the read below shows it, or the error view with its retry.
        if (__DEV__) console.warn('[training-plans] The notes could not be listed after saving one', error);
        flight().unlisted = true;
      }
      // A listing that started before a newer one was shown may lack the notes saved meanwhile: it does not replace it.
      if (list && ticket > (shownListing.current.get(assignmentId) ?? 0)) {
        // shortcut: the ticket is taken even if the screen then drops this listing (other athlete or read), so an older listing is dropped after it too; upgrade if an older listing must apply to a read that started before the dropped one (issue 625).
        shownListing.current.set(assignmentId, ticket);
        const notes = notesOf(list);
        // The person may have moved to another athlete, or the read may have been replaced by another assignment of the same one, while this saved: only the answer this note was written under takes it.
        // It is added to the answer that is there now, never to the one this started from, which a newer read may have replaced with newer marks and times.
        setAnswer((current) => {
          const now = current?.value;
          if (current?.athleteId !== selected.id || !now || now === 'error' || now.assignmentId !== assignmentId) return current;
          return { athleteId: selected.id, value: { ...now, content: { ...now.content, notes } } };
        });
      }
    } finally {
      const mine = flight();
      mine.saving -= 1;
      // The same athlete is being read, and that read started before a note was saved: it may have listed its notes without it, so it reads once more and shows it.
      // A read that started after the saves is left alone: reading again would only replace the data with the read to come. Without an open read, only a failed listing needs one.
      // Saves that overlap read once, when the last of them finishes, after all their notes were added.
      if (mine.saving === 0) {
        const since = reading.current?.since ?? null;
        const stale = since === null ? mine.unlisted : (since.get(assignmentId) ?? 0) < mine.saved;
        if (stale && reading.current?.athleteId === selected.id) setRefreshes((n) => n + 1);
        shownListing.current.delete(assignmentId);
        // An open read compares against the count it started with, so the count stays while one is open.
        if (since === null) flights.current.delete(assignmentId);
        else mine.unlisted = false;
      }
    }
  }

  // Reading again drops the shown data at once (the key changes), so the plan of the previous athlete never stays under the new name.
  const reload = () => setAttempt((n) => n + 1);
  const select = (id: string) => {
    setChosenId(id);
    // The athlete already shown keeps its data: reading again would only flash loading.
    if (id !== selectedId) reload();
  };

  const view = viewOf(athletes, synced, props.offline ?? false, loaded, { onOpenAthletes: props.onOpenAthletes, onRetryAction: props.onRetryAction, actionPending: props.actionPending ?? false, onRetry: reload });

  return (
    <TodayScreen
      athleteName={athleteName}
      view={view}
      athletes={names}
      selectedAthleteId={selectedId}
      onSelectAthlete={select}
      onSendNotice={sendNotice}
      renderNoticeStatus={renderNoticeStatus}
    />
  );
}
