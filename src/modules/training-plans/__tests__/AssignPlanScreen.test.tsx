import { fireEvent, render, screen } from '@testing-library/react-native';

import { AssignPlanContainer, createInMemoryAssignmentRepository, createInMemoryTrainingPlanRepository } from '..';
import { athletes, plan, sources } from '../__fixtures__/assignments';
import { dayLabel, shiftDay, todayText } from '../components/day';

// The school-console barrel pulls in the native PowerSync database; these tests use the in-memory repositories only.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

async function setup(userId: string) {
  const plans = createInMemoryTrainingPlanRepository();
  await plans.save(plan('p1'));
  const assignments = createInMemoryAssignmentRepository(plans);
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

describe('day helpers', () => {
  it('moves across month and year ends and formats the day without a time zone shift', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayLabel('2026-11-02')).toContain('2 de noviembre');
    expect(todayText(new Date(2026, 10, 2, 23, 59))).toBe('2026-11-02');
  });
});
