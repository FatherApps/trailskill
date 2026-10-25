import { useEffect, useRef, useState } from 'react';

import type { StaffSchoolRepository } from '../../school-console';
import type { PlanSummary, TrainingPlanRepository } from '../data/plans';
import '../i18n';
import { PlanListScreen, type PlanListView } from './PlanListScreen';

export type PlansScreenProps = {
  repository: TrainingPlanRepository;
  schools: StaffSchoolRepository;
  userId: string;
  // Changing it reloads the list, for example when the screen regains focus.
  refreshKey?: number;
  onOpenPlan: (id: string) => void;
  onNewPlan: () => void;
};

type State = Exclude<PlanListView, { kind: 'data' }> | { kind: 'ready'; templates: PlanSummary[]; plans: PlanSummary[] };

// Container: finds the school, loads its plans from the local repository and creates plans from templates.
export function PlansScreen({ repository, schools, userId, refreshKey = 0, onOpenPlan, onNewPlan }: PlansScreenProps) {
  const [view, setView] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [copyingId, setCopyingId] = useState<string>();
  const [copyFailed, setCopyFailed] = useState(false);
  // State updates land after the render: a ref blocks a second press made before the loading state shows.
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // shortcut: a coach in several schools gets the first one, upgrade with a school selector.
        const [school] = await schools.listStaffSchools(userId);
        if (cancelled) return;
        if (!school) return setView({ kind: 'no_school' });
        const all = await repository.list(school.id);
        if (cancelled) return;
        setView({ kind: 'ready', templates: all.filter((plan) => plan.isTemplate), plans: all.filter((plan) => !plan.isTemplate) });
      } catch {
        if (!cancelled) setView({ kind: 'error', onRetry: retry });
      }
    })();
    return () => {
      cancelled = true;
    };
    // The repositories are fixed for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshKey, attempt]);

  function retry() {
    setView({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }

  async function useTemplate(id: string) {
    if (busy.current) return;
    busy.current = true;
    setCopyFailed(false);
    setCopyingId(id);
    try {
      onOpenPlan(await repository.copy(id, false));
    } catch {
      setCopyFailed(true);
    } finally {
      busy.current = false;
      setCopyingId(undefined);
    }
  }

  return (
    <PlanListScreen
      view={view.kind === 'ready' ? { ...view, kind: 'data', copyingId, copyFailed } : view}
      onNewPlan={onNewPlan}
      onUseTemplate={useTemplate}
      onOpenPlan={onOpenPlan}
    />
  );
}
