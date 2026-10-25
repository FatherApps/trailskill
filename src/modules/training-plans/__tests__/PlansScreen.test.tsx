import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryStaffSchoolRepository } from '../../school-console';
import { createInMemoryTrainingPlanRepository } from '../data/inMemoryTrainingPlanRepository';
import type { Plan, TrainingPlanRepository } from '../data/plans';
import { PlansScreen } from '../screens/PlansScreen';
import { plansFixture } from '../__fixtures__/plans';

// The school-console barrel pulls in the native PowerSync database; these tests use the in-memory repositories only.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const [warmUp, main] = plansFixture.blocks;
const membership = { schoolId: 'school-1', schoolName: 'Escuela Sintética', userId: 'coach-1', role: 'coach' };
const plan = (id: string, name: string, isTemplate: boolean, schoolId = 'school-1'): Plan => ({
  id,
  schoolId,
  name,
  isTemplate,
  blocks: [warmUp, main],
});

async function setup(options: { memberships?: (typeof membership)[]; repository?: TrainingPlanRepository } = {}) {
  const repository = options.repository ?? createInMemoryTrainingPlanRepository();
  await repository.save(plan('t1', 'Plantilla sintética', true));
  await repository.save(plan('p1', 'Plan sintético', false));
  await repository.save(plan('other', 'Plan de otra escuela', false, 'school-2'));
  const props = {
    repository,
    schools: createInMemoryStaffSchoolRepository(options.memberships ?? [membership]),
    userId: 'coach-1',
    onOpenPlan: jest.fn(),
    onNewPlan: jest.fn(),
  };
  const view = await render(<PlansScreen {...props} />);
  return { ...props, rerender: (refreshKey: number) => view.rerender(<PlansScreen {...props} refreshKey={refreshKey} />) };
}

describe('PlansScreen', () => {
  it('lists the templates and plans of the user school only', async () => {
    await setup();

    expect(await screen.findByText('Plantilla sintética')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Plan sintético' })).toBeOnTheScreen();
    expect(screen.queryByText('Plan de otra escuela')).toBeNull();
  });

  it('starts a new plan and opens an existing one', async () => {
    const { onNewPlan, onOpenPlan } = await setup();

    await fireEvent.press(await screen.findByRole('button', { name: 'Plan nuevo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Plan sintético' }));

    expect(onNewPlan).toHaveBeenCalledTimes(1);
    expect(onOpenPlan).toHaveBeenCalledWith('p1');
  });

  it('creates an independent plan with the template name and opens it', async () => {
    const { repository, onOpenPlan } = await setup();

    await fireEvent.press(await screen.findByRole('button', { name: 'Crear plan' }));

    await act(async () => {});
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
    const copy = await repository.get(onOpenPlan.mock.calls[0][0]);
    expect(copy).toMatchObject({ name: 'Plantilla sintética', isTemplate: false, schoolId: 'school-1' });
    expect(copy!.blocks).toHaveLength(2);

    // Editing one never changes the other, in either direction.
    await repository.save({ ...copy!, blocks: [{ ...copy!.blocks[0], repetitions: 9 }] });
    expect((await repository.get('t1'))!.blocks.map((b) => b.repetitions)).toEqual([warmUp.repetitions, main.repetitions]);
    const template = (await repository.get('t1'))!;
    await repository.save({ ...template, blocks: [] });
    expect((await repository.get(copy!.id))!.blocks.map((b) => b.repetitions)).toEqual([9]);
  });

  it('tells the person when the plan could not be created', async () => {
    const repository = createInMemoryTrainingPlanRepository();
    const { onOpenPlan } = await setup({ repository: { ...repository, copy: jest.fn().mockRejectedValue(new Error('x')) } });

    await fireEvent.press(await screen.findByRole('button', { name: 'Crear plan' }));

    expect(await screen.findByText('No pudimos crear el plan. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(onOpenPlan).not.toHaveBeenCalled();
  });

  it('reloads when the refresh key changes', async () => {
    const { repository, rerender } = await setup();
    await screen.findByText('Plantilla sintética');
    await repository.save(plan('p2', 'Plan guardado después', false));
    expect(screen.queryByText('Plan guardado después')).toBeNull();

    await rerender(1);

    expect(await screen.findByText('Plan guardado después')).toBeOnTheScreen();
  });

  it('explains when the user has no school', async () => {
    await setup({ memberships: [] });

    expect(await screen.findByText('Aún no tienes una escuela')).toBeOnTheScreen();
  });

  it('shows an error with retry when the list cannot be read', async () => {
    const repository = createInMemoryTrainingPlanRepository();
    const list = jest.spyOn(repository, 'list').mockRejectedValueOnce(new Error('x'));
    await setup({ repository });

    await fireEvent.press(await screen.findByRole('button', { name: 'Intentar de nuevo' }));

    expect(list).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Plantilla sintética')).toBeOnTheScreen();
  });
});
