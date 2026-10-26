import { render, screen } from '@testing-library/react-native';

import { createInMemoryStaffSchoolRepository } from '../../school-console';
import { createInMemoryAssignmentRepository } from '../data/inMemoryAssignmentRepository';
import { createInMemoryTrainingPlanRepository } from '../data/inMemoryTrainingPlanRepository';
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

async function setup(initialPlanId?: string) {
  const plans = createInMemoryTrainingPlanRepository();
  for (const [id, name] of [['plan-1', 'Resistencia'], ['plan-2', 'Velocidad']]) {
    await plans.save({ id, schoolId: 'school-1', isTemplate: false, name, blocks: [] });
  }
  await render(
    <AssignPlanContainer
      plans={plans}
      assignments={createInMemoryAssignmentRepository(plans)}
      athletes={{} as never}
      structure={{} as never}
      schools={createInMemoryStaffSchoolRepository([{ schoolId: 'school-1', schoolName: 'Escuela Sintética', userId: 'coach-1', role: 'coach' }])}
      userId="coach-1"
      initialPlanId={initialPlanId}
    />,
  );
  await screen.findByText('Velocidad');
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
});
