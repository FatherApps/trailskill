import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryStaffSchoolRepository } from '../../school-console';
import { createInMemoryAssignmentRepository } from '../data/inMemoryAssignmentRepository';
import { createInMemoryTrainingPlanRepository } from '../data/inMemoryTrainingPlanRepository';
import { todayText } from '../components/day';
import { AssignPlanContainer } from '../screens/AssignPlanContainer';
import type { AssignPlanScreenProps } from '../screens/AssignPlanScreen';

// The barrels pull in the native PowerSync database; these tests use the in-memory repositories only.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
// The school scope has its own tests; here it only has to load.
jest.mock('../data/assignable', () => ({
  ...jest.requireActual('../data/assignable'),
  loadAssignScope: async () => ({
    schoolId: 'school-1',
    inSchool: { athletes: [], groups: [], categories: [] },
    athletes: [],
    groups: [],
    categories: [],
    school: true,
  }),
  listAssignmentsOfDay: async () => [],
}));

// The real screen, with its latest props kept so a test can call a handler without going through the UI gate.
let mockScreenProps: AssignPlanScreenProps;
jest.mock('../screens/AssignPlanScreen', () => {
  const actual = jest.requireActual('../screens/AssignPlanScreen');
  return {
    ...actual,
    AssignPlanScreen: (props: AssignPlanScreenProps) => {
      mockScreenProps = props;
      return actual.AssignPlanScreen(props);
    },
  };
});

async function setup(initialPlanId?: string | string[]) {
  const plans = createInMemoryTrainingPlanRepository();
  for (const [id, name] of [['plan-1', 'Resistencia'], ['plan-2', 'Velocidad']]) {
    await plans.save({ id, schoolId: 'school-1', isTemplate: false, name, blocks: [] });
  }
  const assignments = createInMemoryAssignmentRepository(plans);
  // A plan hidden here leaves the school's list on the next load and comes back when shown again.
  const hidden = new Set<string>();
  const visiblePlans = { ...plans, list: async (schoolId: string) => (await plans.list(schoolId)).filter((p) => !hidden.has(p.id)) };
  const element = (planId?: string | string[], userId = 'coach-1') => (
    <AssignPlanContainer
      plans={visiblePlans}
      assignments={assignments}
      athletes={{} as never}
      structure={{} as never}
      schools={createInMemoryStaffSchoolRepository([
        { schoolId: 'school-1', schoolName: 'Escuela Sintética', userId: 'coach-1', role: 'coach' },
        { schoolId: 'school-1', schoolName: 'Escuela Sintética', userId: 'coach-2', role: 'coach' },
      ])}
      userId={userId}
      initialPlanId={planId}
    />
  );
  const view = await render(element(initialPlanId));
  await screen.findByText('Velocidad');
  return {
    assignments,
    hidden,
    changeParam: (planId?: string | string[]) => view.rerender(element(planId)),
    // A new user id is what reloads the school's list with the screen mounted.
    reload: (planId?: string | string[], userId?: string) => view.rerender(element(planId, userId)),
  };
}

const selected = (name: string) => screen.getByRole('button', { name }).props.accessibilityState?.selected === true;

describe('AssignPlanContainer', () => {
  it('starts with the plan it was opened for selected', async () => {
    await setup('plan-2');

    expect(selected('Velocidad')).toBe(true);
    expect(selected('Resistencia')).toBe(false);
  });

  it('starts with no plan selected when none was given or the given one is not in the school', async () => {
    await setup('plan-unknown');

    expect(selected('Velocidad')).toBe(false);
    expect(selected('Resistencia')).toBe(false);
  });

  it('does not offer to assign when the given plan is not in the school', async () => {
    const { assignments } = await setup('plan-unknown');

    await fireEvent.press(screen.getByRole('radio', { name: 'Toda la escuela' }));

    expect(screen.queryByRole('button', { name: 'Asignar' })).toBeNull();
    expect(await assignments.list('school-1', todayText())).toEqual([]);
  });

  it('follows the plan parameter when it changes with the screen mounted', async () => {
    const { changeParam } = await setup('plan-1');
    expect(selected('Resistencia')).toBe(true);

    await changeParam('plan-2');

    expect(selected('Velocidad')).toBe(true);
    expect(selected('Resistencia')).toBe(false);
  });

  it('takes the first value of a repeated plan parameter', async () => {
    await setup(['plan-2', 'plan-1']);

    expect(selected('Velocidad')).toBe(true);
    expect(selected('Resistencia')).toBe(false);
  });

  it('selects no plan when a repeated plan parameter has no valid first value', async () => {
    await setup(['plan-unknown', 'plan-1']);

    expect(selected('Velocidad')).toBe(false);
    expect(selected('Resistencia')).toBe(false);
  });

  it('keeps a manual choice when the same plan parameter arrives again', async () => {
    const { changeParam } = await setup('plan-1');
    await fireEvent.press(screen.getByRole('button', { name: 'Velocidad' }));

    await changeParam('plan-1');

    expect(selected('Velocidad')).toBe(true);
    expect(selected('Resistencia')).toBe(false);
  });

  it('applies the plan parameter again when it comes back after another value', async () => {
    const { changeParam } = await setup('plan-1');
    await fireEvent.press(screen.getByRole('button', { name: 'Velocidad' }));

    await changeParam('plan-2');
    await changeParam('plan-1');

    expect(selected('Resistencia')).toBe(true);
    expect(selected('Velocidad')).toBe(false);
  });

  it('does not select a plan again that left the list and came back after a manual choice', async () => {
    const { hidden, reload } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Resistencia' }));
    expect(selected('Resistencia')).toBe(true);

    hidden.add('plan-1');
    await reload(undefined, 'coach-2');
    await waitFor(() => expect(screen.queryByText('Resistencia')).toBeNull());
    hidden.delete('plan-1');
    await reload(undefined, 'coach-1');
    await screen.findByText('Resistencia');

    expect(selected('Resistencia')).toBe(false);
    expect(selected('Velocidad')).toBe(false);
  });

  it('treats an empty plan parameter as no parameter', async () => {
    const { changeParam } = await setup('');
    expect(selected('Velocidad')).toBe(false);
    expect(selected('Resistencia')).toBe(false);

    await changeParam('plan-1');
    expect(selected('Resistencia')).toBe(true);

    await changeParam('');
    expect(selected('Resistencia')).toBe(false);
  });

  describe('saving without the button', () => {
    it('writes nothing when no plan of the school is chosen', async () => {
      const { assignments } = await setup('plan-unknown');
      const create = jest.spyOn(assignments, 'create');
      await fireEvent.press(screen.getByRole('radio', { name: 'Toda la escuela' }));

      await act(async () => mockScreenProps.onAssign());

      expect(create).not.toHaveBeenCalled();
      expect(await assignments.list('school-1', todayText())).toEqual([]);
      expect(screen.queryByText('Asignar')).toBeNull();
    });

    it('writes nothing when the kind needs a target and none is chosen', async () => {
      const { assignments } = await setup('plan-1');
      const create = jest.spyOn(assignments, 'create');

      await act(async () => mockScreenProps.onAssign());

      expect(create).not.toHaveBeenCalled();
      // Without the guard the missing target throws and the screen shows a failure.
      expect(mockScreenProps.view).toMatchObject({ kind: 'data', content: { failure: undefined, saving: false } });
    });

    it('writes the assignment when a plan and a target are chosen', async () => {
      const { assignments } = await setup('plan-1');
      const create = jest.spyOn(assignments, 'create');
      await fireEvent.press(screen.getByRole('radio', { name: 'Toda la escuela' }));

      await act(async () => mockScreenProps.onAssign());

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ planId: 'plan-1', target: { kind: 'school' } }));
    });
  });
});
