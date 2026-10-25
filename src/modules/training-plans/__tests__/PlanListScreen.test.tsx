import { fireEvent, render, screen } from '@testing-library/react-native';

import { PlanListScreen, type PlanListView } from '../screens/PlanListScreen';

const handlers = () => ({ onNewPlan: jest.fn(), onUseTemplate: jest.fn(), onOpenPlan: jest.fn() });
const show = async (view: PlanListView, on = handlers()) => {
  await render(<PlanListScreen view={view} {...on} />);
  return on;
};
const data = {
  kind: 'data' as const,
  templates: [{ id: 't1', name: 'Plantilla sintética', isTemplate: true }],
  plans: [{ id: 'p1', name: 'Plan sintético', isTemplate: false }],
};

describe('PlanListScreen', () => {
  it('shows the title and a single primary new-plan button with templates and plans', async () => {
    const on = await show(data);

    expect(screen.getByRole('header', { name: 'Planes de entrenamiento' })).toBeOnTheScreen();
    expect(screen.getByText('Plantilla sintética')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Plan nuevo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Crear plan' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Editar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Plan sintético' }));
    expect(on.onNewPlan).toHaveBeenCalledTimes(1);
    expect(on.onUseTemplate).toHaveBeenCalledWith('t1');
    expect(on.onOpenPlan).toHaveBeenNthCalledWith(1, 't1');
    expect(on.onOpenPlan).toHaveBeenNthCalledWith(2, 'p1');
  });

  it('shows the empty state when there is nothing', async () => {
    await show({ kind: 'data', templates: [], plans: [] });
    expect(screen.getByText('Crea el primer plan o usa una plantilla.')).toBeOnTheScreen();
    expect(screen.queryByText('Plantillas')).toBeNull();
  });

  it('shows the failure notice', async () => {
    await show({ ...data, copyFailed: true });
    expect(screen.getByText('No pudimos crear el plan. Inténtalo de nuevo.')).toBeOnTheScreen();
  });

  it('retries from the error state', async () => {
    const onRetry = jest.fn();
    await show({ kind: 'error', onRetry });
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('explains when the person has no school and offers no new plan', async () => {
    await show({ kind: 'no_school' });
    expect(screen.getByText('Aún no tienes una escuela')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Plan nuevo' })).toBeNull();
  });
});
