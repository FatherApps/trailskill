import { useEffect, useState } from 'react';

import type { AuthorizationStatusRepository } from '../../accounts';
import type { SchoolAthleteRepository } from '../../athletes';
import { athleteDisplay } from '../../athletes';
import type { SchoolStructureRepository, StaffSchoolRepository } from '../../school-console';
import type { SeriesRepository } from '../../timing';
import { nextStatus } from '../components/blockStatus';
import { dayLabel } from '../components/day';
import { cellKey, type FulfillmentCell, type FulfillmentContent } from '../components/fulfillment';
import { athletesOfTarget, type AssignmentRepository } from '../data/assignments';
import { loadAssignScope } from '../data/assignable';
import type { FulfillmentMark, FulfillmentRepository } from '../data/fulfillment';
import type { TrainingPlanRepository } from '../data/plans';
import { planVocabulary } from '../vocabulary';
import type { BlockStatus, PlanBlock } from '../types';
import { FulfillmentScreen, type FulfillmentView } from './FulfillmentScreen';

export type FulfillmentContainerProps = {
  plans: TrainingPlanRepository;
  assignments: AssignmentRepository;
  athletes: SchoolAthleteRepository;
  structure: SchoolStructureRepository;
  schools: StaffSchoolRepository;
  fulfillment: FulfillmentRepository;
  authorizations: AuthorizationStatusRepository;
  // The public API of timing: the arrivals of a series are the times of a cell.
  series: Pick<SeriesRepository, 'listArrivals'>;
  userId: string;
  deviceId: string;
  // The assignment to mark and its day (YYYY-MM-DD).
  assignmentId: string;
  day: string;
  // Opens the series timing for a block that records times.
  onOpenTiming: (blockId: string) => void;
  // A new value reloads the grid, for example after coming back from the timing.
  refreshKey?: number;
};

type Loaded = {
  planName: string;
  versionId: string;
  blocks: PlanBlock[];
  athletes: { id: string; shortName: string; skipped: boolean }[];
  marks: FulfillmentMark[];
  times: Map<string, number>;
};

// How many times of the cell's series belong to the athlete; a missing time is not counted.
async function timesOf(series: FulfillmentContainerProps['series'], marks: FulfillmentMark[]): Promise<Map<string, number>> {
  const times = new Map<string, number>();
  const timed = marks.filter((mark) => mark.seriesId !== null && (mark.status === 'done' || mark.status === 'partial'));
  const arrivals = new Map(await Promise.all([...new Set(timed.map((mark) => mark.seriesId!))].map(async (id) => [id, await series.listArrivals(id)] as const)));
  for (const mark of timed) {
    times.set(cellKey(mark.athleteId, mark.blockId), arrivals.get(mark.seriesId!)!.filter((arrival) => arrival.athleteId === mark.athleteId).length);
  }
  return times;
}

function contentOf({ blocks, athletes, marks, times }: Loaded): FulfillmentContent {
  const cells: Record<string, FulfillmentCell> = {};
  for (const mark of marks) {
    const key = cellKey(mark.athleteId, mark.blockId);
    cells[key] = {
      status: mark.status,
      ...(mark.completedRepetitions !== null && { completedRepetitions: mark.completedRepetitions }),
      ...(times.has(key) && { timesRecorded: times.get(key) }),
    };
  }
  return { athletes, blocks, vocabulary: planVocabulary(), cells };
}

// Container: finds the assignment, its blocks and the athletes in charge of the user, and saves each mark on the device at once.
export function FulfillmentContainer(props: FulfillmentContainerProps) {
  const { plans, assignments, athletes, structure, schools, fulfillment, authorizations, series, userId, deviceId, assignmentId, day, onOpenTiming, refreshKey } = props;
  const [loaded, setLoaded] = useState<Loaded | 'loading' | 'error' | 'denied'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [partial, setPartial] = useState<{ athleteId: string; blockId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // shortcut: a coach in several schools gets the first one, upgrade with a school selector.
        const [school] = await schools.listStaffSchools(userId);
        const assignment = school && (await assignments.list(school.id, day)).find((a) => a.id === assignmentId);
        if (!school || !assignment) return !cancelled && setLoaded('error');
        const scope = await loadAssignScope({ schools, athletes, structure }, userId, school.id);
        // An administrator reads the marks but only a coach marks them: the server refuses an administrator's marks for good.
        if (scope.school) return !cancelled && setLoaded('denied');
        // shortcut: the plan as it is now, because a plan has one version until versioning (6.5) arrives; load the assignment's own version then.
        const [plan, granted, marks] = await Promise.all([plans.get(assignment.planId), authorizations.listGrantedAthleteIds('record_times'), fulfillment.list(assignmentId)]);
        if (!plan) return !cancelled && setLoaded('error');
        const reached = new Set(athletesOfTarget(assignment.target, scope.athletes));
        const next: Loaded = {
          planName: plan.name,
          versionId: assignment.versionId,
          blocks: plan.blocks,
          athletes: scope.athletes
            .filter((athlete) => reached.has(athlete.id))
            .map((athlete, index) => ({ id: athlete.id, shortName: athleteDisplay(athlete, index).shortName, skipped: !granted.includes(athlete.id) })),
          marks,
          times: await timesOf(series, marks),
        };
        if (!cancelled) setLoaded(next);
      } catch {
        if (!cancelled) setLoaded('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // The repositories are fixed for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, assignmentId, day, attempt, refreshKey]);

  async function save(athleteId: string, blockId: string, status: BlockStatus, completedRepetitions?: number) {
    // Only the marks change between two saves, and they are read again from the repository below, so a stale `loaded` is harmless.
    const current = loaded;
    if (typeof current !== 'object') return;
    try {
      // The mark is saved on the device first, so it never waits for the network.
      await fulfillment.mark({ assignmentId, versionId: current.versionId, blockId, athleteId, status, completedRepetitions, authorId: userId, deviceId });
      const marks = await fulfillment.list(assignmentId);
      setLoaded({ ...current, marks, times: await timesOf(series, marks) });
    } catch {
      setLoaded('error');
    }
  }

  function cycle(athleteId: string, blockId: string, next: BlockStatus) {
    const block = typeof loaded === 'object' ? loaded.blocks.find((b) => b.id === blockId) : undefined;
    if (!block) return;
    // A partial needs a count below the total; a block of one repetition has no partial, so the cycle goes on.
    if (next === 'partial' && block.repetitions < 2) return void save(athleteId, blockId, nextStatus('partial'));
    if (next === 'partial') return setPartial({ athleteId, blockId });
    void save(athleteId, blockId, next);
  }

  function retry() {
    setLoaded('loading');
    setAttempt((n) => n + 1);
  }

  const view: FulfillmentView =
    loaded === 'loading' ? { kind: 'loading' } : loaded === 'error' ? { kind: 'error', onRetry: retry } : loaded === 'denied' ? { kind: 'denied' } : { kind: 'data', content: contentOf(loaded) };
  const asking = typeof loaded === 'object' && partial ? loaded : null;
  const askedBlock = asking?.blocks.find((b) => b.id === partial?.blockId);

  return (
    <FulfillmentScreen
      planName={typeof loaded === 'object' ? loaded.planName : ''}
      dateLabel={dayLabel(day)}
      view={view}
      onCycle={cycle}
      onOpenTiming={onOpenTiming}
      partial={
        asking && askedBlock && partial
          ? {
              athleteName: asking.athletes.find((a) => a.id === partial.athleteId)?.shortName ?? '',
              max: askedBlock.repetitions - 1,
              onPick: (count) => {
                setPartial(null);
                void save(partial.athleteId, partial.blockId, 'partial', count);
              },
              onCancel: () => setPartial(null),
            }
          : undefined
      }
    />
  );
}
