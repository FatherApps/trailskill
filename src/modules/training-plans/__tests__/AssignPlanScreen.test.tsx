import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { AssignPlanContainer, createInMemoryAssignmentRepository, createInMemoryTrainingPlanRepository, type AssignmentTarget } from '..';
import { athletes, plan, sources } from '../__fixtures__/assignments';
import { dayLabel, shiftDay, todayText } from '../components/day';

// The school-console barrel pulls in the native PowerSync database; these tests use the in-memory repositories only.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

async function setup(userId: string, existing: AssignmentTarget[] = []) {
  const plans = createInMemoryTrainingPlanRepository();
  await plans.save(plan('p1'));
  const assignments = createInMemoryAssignmentRepository(plans, () => userId);
  for (const target of existing) await assignments.create({ planId: 'p1', schoolId: 's1', sessionDate: '2026-11-02', target });
  await render(
    <AssignPlanContainer
      plans={plans}
      assignments={assignments}
      athletes={athletes}
      structure={sources.structure}
      schools={sources.schools}
      userId={userId}
      initialDay="2026-11-02"
    />,
  );
  return assignments;
}

describe('AssignPlanScreen', () => {
  it('assigns a plan to a group for a day and lists it with the athletes it reaches', async () => {
    const assignments = await setup('admin');

    await fireEvent.press(await screen.findByRole('button', { name: 'Plan p1' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Grupo A' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Asignar' }));

    expect(await screen.findByText('Llega a 2 deportistas')).toBeOnTheScreen();
    expect(await assignments.list('s1', '2026-11-02')).toMatchObject([{ planId: 'p1', target: { kind: 'group', groupId: 'g1' } }]);
  });

  it('assigns the whole school without picking anyone, and shows it on its day only', async () => {
    await setup('admin');

    await fireEvent.press(await screen.findByRole('button', { name: 'Plan p1' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Toda la escuela' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Asignar' }));
    expect(await screen.findByText('Llega a 5 deportistas')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Día siguiente' }));
    expect(await screen.findByText('Aún no hay asignaciones para este día.')).toBeOnTheScreen();
  });

  it('offers a coach only the athletes and groups in charge', async () => {
    await setup('k1');

    expect(await screen.findByRole('button', { name: 'Grupo A' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Grupo B' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Categoría' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Toda la escuela' })).toBeNull();
  });
});

describe('withdrawing an assignment', () => {
  const group = (groupId: string): AssignmentTarget => ({ kind: 'group', groupId });
  const athlete = (athleteId: string): AssignmentTarget => ({ kind: 'athlete', athleteId });
  // Coach k1 has group g1 and the athlete a4; the rest is out of charge or shared by the whole school.
  const all: AssignmentTarget[] = [group('g1'), athlete('a4'), group('g2'), athlete('a3'), { kind: 'category', categoryId: 'c1' }, { kind: 'school' }];
  const rowOf = async (assignments: Awaited<ReturnType<typeof setup>>, index: number) =>
    screen.findByTestId(`assigned-${(await assignments.list('s1', '2026-11-02'))[index].id}`);

  it('offers a coach to withdraw only the assignments of the athletes and groups in charge', async () => {
    const assignments = await setup('k1', all);
    await screen.findByText('Asignado para este día');

    const offered = await Promise.all(all.map(async (_, i) => within(await rowOf(assignments, i)).queryByRole('button', { name: 'Quitar asignación' }) !== null));
    expect(offered).toEqual([true, true, false, false, false, false]);
  });

  it('offers an administrator to withdraw every assignment of the school', async () => {
    await setup('admin', all);

    expect(await screen.findAllByRole('button', { name: 'Quitar asignación' })).toHaveLength(all.length);
  });

  it('withdraws the assignment only after the confirmation, and keeps it when cancelled', async () => {
    const assignments = await setup('admin', [group('g1')]);

    await fireEvent.press(await screen.findByRole('button', { name: 'Quitar asignación' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Conservar asignación' }));
    expect(screen.getByText('Llega a 2 deportistas')).toBeOnTheScreen();
    expect(await assignments.list('s1', '2026-11-02')).toHaveLength(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Quitar asignación' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Quitar del día' }));
    expect(await screen.findByText('Aún no hay asignaciones para este día.')).toBeOnTheScreen();
    expect(await assignments.list('s1', '2026-11-02')).toHaveLength(0);
  });
});

describe('day helpers', () => {
  it('moves across month and year ends and formats the day without a time zone shift', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayLabel('2026-11-02')).toContain('2 de noviembre');
    expect(todayText(new Date(2026, 10, 2, 23, 59))).toBe('2026-11-02');
  });
});
