import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryStaffSchoolRepository } from '../../school-console';
import { createInMemoryAssignmentRepository } from '../data/inMemoryAssignmentRepository';
import { createInMemoryTrainingPlanRepository } from '../data/inMemoryTrainingPlanRepository';
import { todayText } from '../components/day';
import { AssignPlanContainer } from '../screens/AssignPlanContainer';

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

async function setup(initialPlanId?: string | string[]) {
  const plans = createInMemoryTrainingPlanRepository();
  for (const [id, name] of [['plan-1', 'Resistencia'], ['plan-2', 'Velocidad']]) {
    await plans.save({ id, schoolId: 'school-1', isTemplate: false, name, blocks: [] });
  }
  const assignments = createInMemoryAssignmentRepository(plans);
  const element = (planId?: string | string[]) => (
    <AssignPlanContainer
      plans={plans}
      assignments={assignments}
      athletes={{} as never}
      structure={{} as never}
      schools={createInMemoryStaffSchoolRepository([{ schoolId: 'school-1', schoolName: 'Escuela Sintética', userId: 'coach-1', role: 'coach' }])}
      userId="coach-1"
      initialPlanId={planId}
    />
  );
  const view = await render(element(initialPlanId));
  await screen.findByText('Velocidad');
  return { assignments, changeParam: (planId?: string | string[]) => view.rerender(element(planId)) };
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
});
