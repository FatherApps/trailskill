import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { createInMemoryAthleteSchoolRepository } from '../../athletes';
import {
  createInMemoryAssignmentRepository,
  createInMemoryFulfillmentRepository,
  createInMemoryNoticeRepository,
  createInMemoryTrainingPlanRepository,
  TodayContainer,
  type PlanBlock,
} from '..';
import { athletes, plan } from '../__fixtures__/assignments';

// The barrels pull in the native PowerSync database; these tests use the in-memory repositories only.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const DAY = '2026-11-02';
const timed: PlanBlock = { id: 'b2', phase: 'main', repetitions: 3, distance: 50, activity: 'FR', equipment: ['fins'], sendOffSeconds: null, recording: 'per_repetition' };
const schoolLinks = createInMemoryAthleteSchoolRepository([
  { athleteId: 'a1', schoolId: 's1', categoryId: 'c1' },
  { athleteId: 'a3', schoolId: 's1', categoryId: 'c2' },
]);

async function setup(options: { ids?: string[]; initialAthleteId?: string; changePlan?: boolean; onOpenAthletes?: () => void } = {}) {
  const { ids = ['a1'], initialAthleteId, changePlan = false, onOpenAthletes } = options;
  const plans = createInMemoryTrainingPlanRepository();
  // Plan p1 (an untimed and a timed block) goes to group g1, which has a1; plan p2 goes to group g2, which has a3.
  await plans.save({ ...plan('p1'), blocks: [...plan('p1').blocks, timed] });
  await plans.save({ ...plan('p2'), name: 'Plan del otro' });
  const assignments = createInMemoryAssignmentRepository(plans);
  const one = await assignments.create({ planId: 'p1', schoolId: 's1', sessionDate: DAY, target: { kind: 'group', groupId: 'g1' } });
  await assignments.create({ planId: 'p2', schoolId: 's1', sessionDate: DAY, target: { kind: 'group', groupId: 'g2' } });
  if (changePlan) await plans.save({ ...plan('p1'), blocks: [...plan('p1').blocks, timed] });
  const fulfillment = createInMemoryFulfillmentRepository({}, plans);
  await fulfillment.mark({ assignmentId: one, versionId: 'p1-v1', blockId: 'b2', athleteId: 'a1', status: 'partial', completedRepetitions: 2, seriesId: 'series-1', authorId: 'k1', deviceId: 'tablet-1' });
  // Rep 2 has no time; the arrival of another athlete never shows.
  const arrivals = [
    { athleteId: 'a1', hundredths: 3105 },
    { athleteId: 'a2', hundredths: 2999 },
    { athleteId: 'a1', hundredths: null },
  ];
  const notices = createInMemoryNoticeRepository();
  await render(
    <TodayContainer
      plans={plans}
      assignments={assignments}
      schoolLinks={schoolLinks}
      fulfillment={fulfillment}
      notices={notices}
      series={{ listArrivals: async () => arrivals } as never}
      userId="guardian-1"
      athletes={await athletes.listByIds(ids)}
      initialAthleteId={initialAthleteId}
      day={DAY}
      onOpenAthletes={onOpenAthletes}
      renderNoticeStatus={(id) => <Text>{`sync:${id}`}</Text>}
    />,
  );
  return { one, notices };
}

describe('TodayContainer', () => {
  it('shows the plan of the day of the athlete with its equipment, block status and times, and "—" for a missing time', async () => {
    await setup();

    expect(await screen.findByText('Plan p1')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Hoy · A1 S.' })).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Aletas').filter((node) => node.props.accessibilityRole === 'text')).toHaveLength(1);
    expect(screen.getByLabelText('Sin marcar')).toBeOnTheScreen();
    expect(screen.getByLabelText('Parcial · 2 de 3')).toBeOnTheScreen();
    expect(screen.getByText('31,05')).toBeOnTheScreen();
    // Rep 2 (null) and rep 3 (no arrival): never a zero.
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText(/29,99/)).toBeNull();
    expect(screen.queryByText(/0,00/)).toBeNull();
  });

  it('shows the short name only, never the last name', async () => {
    await setup();

    await screen.findByText('Plan p1');
    expect(screen.queryByText(/Sintético/)).toBeNull();
  });

  it('shows the notice only when the plan changed after it was assigned', async () => {
    await setup();
    await screen.findByText('Plan p1');
    expect(screen.queryByText('El entrenador cambió el plan de hoy.')).toBeNull();
  });

  it('shows the plan-changed notice when the plan has a new version', async () => {
    await setup({ changePlan: true });

    expect(await screen.findByText('El entrenador cambió el plan de hoy.')).toBeOnTheScreen();
  });

  it('lets a guardian with two athletes pick one and shows only the plan of that athlete', async () => {
    await setup({ ids: ['a1', 'a3'] });

    expect(await screen.findByText('Plan p1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'A3 S.' }));
    expect(await screen.findByText('Plan del otro')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Hoy · A3 S.' })).toBeOnTheScreen();
    expect(screen.queryByText(/Plan p1/)).toBeNull();
  });

  it('starts with the athlete from the link', async () => {
    await setup({ ids: ['a1', 'a3'], initialAthleteId: 'a3' });

    expect(await screen.findByText('Plan del otro')).toBeOnTheScreen();
  });

  it('says there is no plan when the athlete has none today', async () => {
    await setup({ ids: ['a4'] });

    expect(await screen.findByText('Hoy no hay plan')).toBeOnTheScreen();
  });

  it('says there is no linked athlete, not "no plan", when the user manages nobody, and leads to "Mis deportistas"', async () => {
    const onOpenAthletes = jest.fn();
    await setup({ ids: [], onOpenAthletes });

    expect(await screen.findByText('Aún no hay un deportista vinculado')).toBeOnTheScreen();
    expect(screen.queryByText('Hoy no hay plan')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Ir a Mis deportistas' }));
    expect(onOpenAthletes).toHaveBeenCalledTimes(1);
  });

  it('saves a note with author, athlete, assignment, version and block, and lists it with its sync status', async () => {
    const { one, notices } = await setup();
    await screen.findByText('Plan p1');

    await fireEvent.press(screen.getByRole('button', { name: 'Avisar algo al entrenador' }));
    await fireEvent.press(screen.getByText('Bloque 2'));
    await fireEvent.changeText(screen.getByLabelText('Tu aviso'), 'Test note 1');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar aviso' }));

    expect(await screen.findByText('Test note 1')).toBeOnTheScreen();
    expect(await notices.list('a1', one)).toMatchObject([{ authorId: 'guardian-1', athleteId: 'a1', assignmentId: one, versionId: 'p1-v1', blockId: 'b2', body: 'Test note 1' }]);
    expect(screen.getByText(/^sync:/)).toBeOnTheScreen();
    expect(screen.getByText(/· Bloque 2$/)).toBeOnTheScreen();
  });
});
