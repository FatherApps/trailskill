import { useEffect, useRef, useState } from 'react';

import type { SchoolAthleteRepository } from '../../athletes';
import type { SchoolStructureRepository, StaffSchoolRepository } from '../../school-console';
import { dayLabel, shiftDay, todayText } from '../components/day';
import { assignPlan, canWithdraw, listAssignmentsOfDay, loadAssignScope, type AssignScope } from '../data/assignable';
import { PlanNotAssignableError, TargetNotInChargeError, TargetOutsideSchoolError, type AssignmentRepository, type AssignmentTarget } from '../data/assignments';
import type { PlanSummary, TrainingPlanRepository } from '../data/plans';
import '../i18n';
import { t } from '../../../core/i18n';
import { AssignPlanScreen, type AssignedRow, type AssignmentKind, type AssignOption, type AssignPlanContent, type AssignPlanView } from './AssignPlanScreen';

export type AssignPlanContainerProps = {
  plans: TrainingPlanRepository;
  assignments: AssignmentRepository;
  athletes: SchoolAthleteRepository;
  structure: SchoolStructureRepository;
  schools: StaffSchoolRepository;
  userId: string;
  // The day shown first (YYYY-MM-DD); today when omitted.
  initialDay?: string;
  // The plan selected first, for example the one just saved in the editor; none when omitted or not in the school's list.
  // A repeated route parameter (`?plan=a&plan=b`) arrives as an array: the first non-empty value wins.
  initialPlanId?: string | string[];
  // Opens the fulfillment grid of an assignment of the day shown.
  onOpenFulfillment?: (assignmentId: string, day: string) => void;
};

type Loaded = { schoolId: string; scope: AssignScope; plans: PlanSummary[] };

const fullName = (a: { firstName: string; lastName: string }) => `${a.firstName} ${a.lastName}`;

function optionsOf(scope: AssignScope, kind: AssignmentKind): AssignOption[] {
  if (kind === 'athlete') return scope.athletes.map((a) => ({ id: a.id, label: fullName(a) }));
  if (kind === 'group') return scope.groups.map((g) => ({ id: g.id, label: g.name }));
  if (kind === 'category') return scope.categories.map((c) => ({ id: c.id, label: c.name }));
  return [];
}

function targetOf(kind: AssignmentKind, optionId: string | null): AssignmentTarget | null {
  if (kind === 'school') return { kind };
  if (optionId === null) return null;
  if (kind === 'athlete') return { kind, athleteId: optionId };
  if (kind === 'group') return { kind, groupId: optionId };
  return { kind, categoryId: optionId };
}

function targetLabel(scope: AssignScope, target: AssignmentTarget): string {
  const { inSchool } = scope;
  if (target.kind === 'athlete') return fullName(inSchool.athletes.find((a) => a.id === target.athleteId) ?? { firstName: '', lastName: '' }).trim();
  if (target.kind === 'group') return inSchool.groups.find((g) => g.id === target.groupId)?.name ?? '';
  if (target.kind === 'category') return inSchool.categories.find((c) => c.id === target.categoryId)?.name ?? '';
  return t('training_plans.assign.kind.school');
}

// Container: finds the school and what the user may assign, and saves the assignments through the local repository.
// Each user gets a screen of their own: nothing of the previous one (list, day, choices, failure, the saving state) carries over.
// A save or withdrawal still on its way is not cancelled: the remount only cuts its UI, and the write finishes on the device.
// shortcut: no guard for an empty `userId`, the route renders this only with a session so the id is always set; add one if a caller can pass a transient id.
export function AssignPlanContainer(props: AssignPlanContainerProps) {
  return <AssignPlanBody key={props.userId} {...props} />;
}

function AssignPlanBody({ plans, assignments, athletes, structure, schools, userId, initialDay, initialPlanId, onOpenFulfillment }: AssignPlanContainerProps) {
  const [loaded, setLoaded] = useState<Loaded | 'loading' | 'error' | 'no_school'>('loading');
  const [attempt, setAttempt] = useState(0);
  const ready = typeof loaded === 'object' ? loaded : null;
  const [day, setDay] = useState(initialDay ?? todayText());
  // shortcut: the list of the previous day stays until the new day resolves, because clearing it shows an empty list while it loads; upgrade with a loading state for the rows.
  const [rows, setRows] = useState<AssignedRow[]>([]);
  // An empty parameter (`?plan=`, or an empty first value of a repeated one) counts as none.
  const preselected = (Array.isArray(initialPlanId) ? initialPlanId.find(Boolean) : initialPlanId) || null;
  // The person's own choice, made under a parameter value. It is dropped from state when the parameter changes, so a value that comes
  // back is applied again, and when a loaded list lacks the picked plan, so it does not come back selected when a list gets it again.
  // The list is only ever set by the load below, so that is the one place its loss is seen.
  const [pick, setPick] = useState<{ param: string | null; id: string } | null>(null);
  // Dropped while rendering, so the stale choice never reaches the screen and nothing runs on unmount.
  // No loop: React re-renders at once, and `pick` is null then, so the guard is false.
  if (pick && pick.param !== preselected) setPick(null);
  const planId = pick?.id ?? preselected;
  const [kind, setKind] = useState<AssignmentKind>('group');
  const [optionId, setOptionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<AssignPlanContent['failure']>();
  // State updates land after the render: a ref blocks a second press made before the saving state shows.
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // shortcut: a coach in several schools gets the first one, upgrade with a school selector.
        const [school] = await schools.listStaffSchools(userId);
        if (cancelled) return;
        if (!school) return setLoaded('no_school');
        const [scope, all] = await Promise.all([loadAssignScope({ schools, athletes, structure }, userId, school.id), plans.list(school.id)]);
        if (cancelled) return;
        setLoaded({ schoolId: school.id, scope, plans: all });
        setPick((current) => (current && all.some((p) => p.id === current.id) ? current : null));
      } catch {
        if (!cancelled) setLoaded('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // The repositories are fixed for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, attempt]);

  // Shown and saved: only a plan of the school's list counts as chosen.
  const chosenPlanId = ready?.plans.some((p) => p.id === planId) ? planId : null;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const ofDay = await listAssignmentsOfDay({ assignments, athletes }, ready.schoolId, day);
        if (cancelled) return;
        setRows(
          ofDay.map(({ assignment, athleteIds }) => ({
            id: assignment.id,
            planName: ready.plans.find((p) => p.id === assignment.planId)?.name ?? '',
            targetLabel: targetLabel(ready.scope, assignment.target),
            athleteCount: athleteIds.length,
            canWithdraw: canWithdraw(ready.scope, assignment.target),
          })),
        );
      } catch {
        if (!cancelled) setLoaded('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // `saving` going back to false reloads the day after a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, day, saving]);

  async function save() {
    const target = targetOf(kind, optionId);
    if (busy.current || !ready || !chosenPlanId || !target) return;
    busy.current = true;
    setFailure(undefined);
    setSaving(true);
    try {
      await assignPlan(assignments, ready.scope, { planId: chosenPlanId, sessionDate: day, target });
      setOptionId(null);
    } catch (error) {
      const denied = error instanceof PlanNotAssignableError || error instanceof TargetNotInChargeError || error instanceof TargetOutsideSchoolError;
      setFailure(denied ? 'denied' : 'save');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  // The repository writes on the device first, so the row leaves the list at once, also offline.
  async function withdraw(id: string) {
    if (busy.current) return;
    busy.current = true;
    setFailure(undefined);
    try {
      await assignments.withdraw(id);
      setRows((current) => current.filter((row) => row.id !== id));
    } catch {
      setFailure('withdraw');
    } finally {
      busy.current = false;
    }
  }

  function retry() {
    setLoaded('loading');
    setAttempt((n) => n + 1);
  }

  let view: AssignPlanView;
  if (!ready) {
    view = loaded === 'error' ? { kind: 'error', onRetry: retry } : loaded === 'no_school' ? { kind: 'no_school' } : { kind: 'loading' };
  } else {
    const { scope } = ready;
    const kinds: AssignmentKind[] = scope.school ? ['athlete', 'group', 'category', 'school'] : ['athlete', 'group'];
    view = {
      kind: 'data',
      content: {
        dateLabel: dayLabel(day),
        plans: ready.plans,
        selectedPlanId: chosenPlanId,
        kinds,
        kind,
        options: optionsOf(scope, kind),
        selectedOptionId: optionId,
        assigned: rows,
        saving,
        failure,
      },
    };
  }

  return (
    <AssignPlanScreen
      view={view}
      onPreviousDay={() => setDay((d) => shiftDay(d, -1))}
      onNextDay={() => setDay((d) => shiftDay(d, 1))}
      onSelectPlan={(id) => setPick({ param: preselected, id })}
      onSelectKind={(next) => {
        setKind(next);
        setOptionId(null);
      }}
      onSelectOption={setOptionId}
      onAssign={save}
      onWithdraw={withdraw}
      onOpenFulfillment={onOpenFulfillment && ((id) => onOpenFulfillment(id, day))}
    />
  );
}
