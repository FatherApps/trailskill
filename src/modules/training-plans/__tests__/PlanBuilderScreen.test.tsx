import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '../../../core/theme';
import { PlanBuilderScreen, type PlanBuilderScreenProps } from '../screens/PlanBuilderScreen';
import { plansFixture } from '../__fixtures__/plans';

const { blocks, vocabulary } = plansFixture;

function setup(props: Partial<PlanBuilderScreenProps> = {}) {
  const handlers = {
    onAddBlock: jest.fn(),
    onEditBlock: jest.fn(),
    onMoveBlock: jest.fn(),
    onChangeBlock: jest.fn(),
    onDoneEditing: jest.fn(),
    onSaveTemplate: jest.fn(),
  };
  return {
    handlers,
    ui: <PlanBuilderScreen planName="Resistencia aeróbica" blocks={blocks} vocabulary={vocabulary} {...handlers} {...props} />,
  };
}

describe('PlanBuilderScreen', () => {
  it('shows the empty state and no save button without blocks', async () => {
    await render(setup({ blocks: [] }).ui);

    expect(screen.getByText('Aún no hay bloques')).toBeOnTheScreen();
    expect(screen.getByText('Agrega el primer bloque del plan: calentamiento, principal, técnica o enfriamiento.')).toBeOnTheScreen();
    expect(screen.getByText('0 bloques')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Guardar como plantilla' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Agregar bloque' })).toBeOnTheScreen();
  });

  it('shows the title and the block count', async () => {
    await render(setup().ui);

    expect(screen.getByRole('header', { name: 'Resistencia aeróbica' })).toBeOnTheScreen();
    expect(screen.getByText('5 bloques')).toBeOnTheScreen();
  });

  it('says "1 bloque" for a single block', async () => {
    await render(setup({ blocks: [blocks[0]] }).ui);

    expect(screen.getByText('1 bloque')).toBeOnTheScreen();
  });

  it('fires the callbacks with the right arguments', async () => {
    const { handlers, ui } = setup();
    await render(ui);

    await fireEvent.press(screen.getAllByRole('button', { name: 'Editar' })[1]);
    expect(handlers.onEditBlock).toHaveBeenCalledWith('b2');

    await fireEvent.press(screen.getAllByRole('button', { name: 'Subir' })[0]);
    expect(handlers.onMoveBlock).toHaveBeenLastCalledWith('b2', 'up');

    await fireEvent.press(screen.getAllByRole('button', { name: 'Bajar' })[0]);
    expect(handlers.onMoveBlock).toHaveBeenLastCalledWith('b1', 'down');

    await fireEvent.press(screen.getByRole('button', { name: 'Agregar bloque' }));
    expect(handlers.onAddBlock).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Guardar como plantilla' }));
    expect(handlers.onSaveTemplate).toHaveBeenCalledTimes(1);
  });

  it('hides Subir on the first block and Bajar on the last', async () => {
    await render(setup().ui);

    expect(screen.getAllByRole('button', { name: 'Subir' })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: 'Bajar' })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(5);
  });

  it('identifies the block in the action hints', async () => {
    await render(setup().ui);

    expect(screen.getAllByRole('button', { name: 'Editar' })[1].props.accessibilityHint).toBe('Bloque 2');
  });

  it('has exactly one primary (lime) button', async () => {
    await render(setup({ editingId: 'b2' }).ui);

    const primary = screen
      .getAllByRole('button')
      .filter((button) => StyleSheet.flatten(button.props.style)?.backgroundColor === colors.light.action);
    expect(primary).toHaveLength(1);
    expect(within(primary[0]).getByText('Guardar como plantilla')).toBeOnTheScreen();
  });

  describe('editing', () => {
    const editing = blocks[1]; // main, 8 x 50 Libre, Paletas, 60 s, per repetition

    it('renders the editor in place of the actions of the edited block only', async () => {
      await render(setup({ editingId: 'b2' }).ui);

      expect(screen.getByRole('button', { name: 'Listo' })).toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(4);
      expect(screen.getByLabelText('Fase')).toBeOnTheScreen();
    });

    it('calls onDoneEditing from Listo', async () => {
      const { handlers, ui } = setup({ editingId: 'b2' });
      await render(ui);

      await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));

      expect(handlers.onDoneEditing).toHaveBeenCalledTimes(1);
    });

    it('changes the phase', async () => {
      const { handlers, ui } = setup({ editingId: 'b2' });
      await render(ui);

      await fireEvent.press(within(screen.getByLabelText('Fase')).getByRole('radio', { name: 'Técnica' }));

      expect(handlers.onChangeBlock).toHaveBeenCalledWith({ ...editing, phase: 'technique' });
    });

    it('steps the repetitions and clamps at 1', async () => {
      const { handlers, ui } = setup({ editingId: 'b2' });
      await render(ui);

      await fireEvent.press(screen.getByRole('button', { name: 'Sumar una repetición' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...editing, repetitions: 9 });

      await fireEvent.press(screen.getByRole('button', { name: 'Quitar una repetición' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...editing, repetitions: 7 });
    });

    it('never goes below one repetition', async () => {
      const { handlers, ui } = setup({ blocks: [{ ...editing, repetitions: 1 }], editingId: 'b2' });
      await render(ui);

      await fireEvent.press(screen.getByRole('button', { name: 'Quitar una repetición' }));

      expect(handlers.onChangeBlock).toHaveBeenCalledWith({ ...editing, repetitions: 1 });
    });

    it('changes the distance and the activity', async () => {
      const { handlers, ui } = setup({ editingId: 'b2' });
      await render(ui);

      await fireEvent.press(within(screen.getByLabelText('Distancia')).getByRole('radio', { name: '100 m' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...editing, distance: 100 });

      await fireEvent.press(within(screen.getByLabelText('Estilo o ejercicio')).getByRole('radio', { name: 'Patada' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...editing, activity: 'kick' });
    });

    it('toggles the equipment', async () => {
      const { handlers, ui } = setup({ editingId: 'b2' });
      await render(ui);

      expect(screen.getByRole('checkbox', { name: 'Paletas' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Tabla' })).not.toBeChecked();

      await fireEvent.press(screen.getByRole('checkbox', { name: 'Tabla' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...editing, equipment: ['paddles', 'board'] });

      await fireEvent.press(screen.getByRole('checkbox', { name: 'Paletas' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...editing, equipment: [] });
    });

    it('steps the send-off in 5 seconds and returns to none at 0', async () => {
      const { handlers, ui } = setup({ editingId: 'b2' });
      await render(ui);
      expect(screen.getByText('1:00')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Sumar 5 segundos' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...editing, sendOffSeconds: 65 });

      await fireEvent.press(screen.getByRole('button', { name: 'Quitar 5 segundos' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...editing, sendOffSeconds: 55 });
    });

    it('maps a send-off of 0 to none and starts from 5 seconds', async () => {
      const five = { ...editing, sendOffSeconds: 5 };
      const { handlers, ui } = setup({ blocks: [five], editingId: 'b2' });
      await render(ui);

      await fireEvent.press(screen.getByRole('button', { name: 'Quitar 5 segundos' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...editing, sendOffSeconds: null });
    });

    it('shows "Sin salida" for no send-off and adds 5 seconds from there', async () => {
      const none = { ...editing, sendOffSeconds: null };
      const { handlers, ui } = setup({ blocks: [none], editingId: 'b2' });
      await render(ui);
      expect(screen.getByText('Sin salida')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Quitar 5 segundos' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...none, sendOffSeconds: null });

      await fireEvent.press(screen.getByRole('button', { name: 'Sumar 5 segundos' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...none, sendOffSeconds: 5 });
    });

    it('changes what is recorded', async () => {
      const { handlers, ui } = setup({ editingId: 'b2' });
      await render(ui);

      await fireEvent.press(within(screen.getByLabelText('Qué se registra')).getByRole('radio', { name: 'Total de la serie' }));

      expect(handlers.onChangeBlock).toHaveBeenCalledWith({ ...editing, recording: 'series_total' });
    });
  });
});
