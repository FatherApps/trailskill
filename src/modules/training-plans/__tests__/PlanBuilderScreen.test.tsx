import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, contrastRatio, type ColorToken, type ThemeName } from '../../../core/theme';
import { PlanBuilderScreen, type PlanBuilderScreenProps } from '../screens/PlanBuilderScreen';
import { plansFixture } from '../__fixtures__/plans';
import { phaseColors } from '../components/PhaseTag';
import type { BlockPhase } from '../types';

const { blocks, vocabulary } = plansFixture;

function setup(props: Partial<PlanBuilderScreenProps> = {}) {
  const handlers = {
    onChangeName: jest.fn(),
    onAddBlock: jest.fn(),
    onEditBlock: jest.fn(),
    onMoveBlock: jest.fn(),
    onChangeBlock: jest.fn(),
    onDoneEditing: jest.fn(),
    onRemoveBlock: jest.fn(),
    onSave: jest.fn(),
    onSaveTemplate: jest.fn(),
  };
  return {
    handlers,
    ui: <PlanBuilderScreen planName="Resistencia aeróbica" blocks={blocks} vocabulary={vocabulary} {...handlers} {...props} />,
  };
}

describe('PlanBuilderScreen', () => {
  it('shows the empty state and no template button without blocks', async () => {
    await render(setup({ blocks: [] }).ui);

    expect(screen.getByText('Aún no hay bloques')).toBeOnTheScreen();
    expect(screen.getByText('Agrega el primer bloque del plan: calentamiento, principal, técnica o enfriamiento.')).toBeOnTheScreen();
    expect(screen.getByText('0 bloques')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Guardar como plantilla' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Agregar bloque' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Guardar plan' })).toBeOnTheScreen();
  });

  it('nests its ScrollView so it scrolls inside a parent ScrollView on Android', async () => {
    await render(setup({ blocks: [] }).ui);

    // Walk up from a button to the ScrollView (the jest mock wraps it, so match its props, not its type).
    let node = screen.getByRole('button', { name: 'Agregar bloque' }).parent;
    while (node && node.props.contentContainerStyle === undefined) node = node.parent;
    if (!node) throw new Error('No ScrollView above the add button');
    expect(node.props.nestedScrollEnabled).toBe(true);
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

    await fireEvent.press(screen.getByRole('button', { name: 'Guardar plan' }));
    expect(handlers.onSave).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Guardar como plantilla' }));
    expect(handlers.onSaveTemplate).toHaveBeenCalledTimes(1);
  });

  describe('expanded width', () => {
    const wide = { width: 1024 };

    it('keeps the single column below the expanded breakpoint', async () => {
      await render(setup({ width: 1023, editingId: 'b2' }).ui);

      expect(screen.queryByTestId('builder-list')).toBeNull();
      expect(screen.queryByTestId('builder-panel')).toBeNull();
    });

    it('shows the block list and the editing panel side by side', async () => {
      await render(setup({ ...wide, editingId: 'b2' }).ui);

      expect(within(screen.getByTestId('builder-list')).getAllByText(/^\d+ × \d+ m /)).toHaveLength(5);
      const panel = within(screen.getByTestId('builder-panel'));
      expect(panel.getByRole('header', { name: 'Editando el bloque 2' })).toBeOnTheScreen();
      expect(panel.getByLabelText('Fase')).toBeOnTheScreen();
      // The editor lives in the panel only, not inside the card.
      expect(screen.getAllByLabelText('Fase')).toHaveLength(1);
    });

    it('summarises the plan with its metres and block count in the header', async () => {
      await render(setup(wide).ui);

      expect(screen.getByText('950 m · 5 bloques')).toBeOnTheScreen();
    });

    it('adds up the metres once per change of blocks, not on every render', async () => {
      const list = [...blocks];
      const reduce = jest.spyOn(list, 'reduce');
      const { rerender } = await render(setup({ ...wide, blocks: list }).ui);
      await rerender(setup({ ...wide, blocks: list, planName: 'Otro nombre' }).ui);

      expect(screen.getByText('950 m · 5 bloques')).toBeOnTheScreen();
      expect(reduce).toHaveBeenCalledTimes(1);
    });

    it('asks to pick a block while none is being edited', async () => {
      await render(setup(wide).ui);

      expect(within(screen.getByTestId('builder-panel')).getByText('Elige un bloque para editarlo')).toBeOnTheScreen();
    });

    it('opens a block in the panel and keeps move and remove on the cards', async () => {
      const { handlers, ui } = setup({ ...wide, editingId: 'b2' });
      await render(ui);

      expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(4);
      await fireEvent.press(screen.getAllByRole('button', { name: 'Editar' })[0]);
      expect(handlers.onEditBlock).toHaveBeenCalledWith('b1');
      expect(screen.getAllByRole('button', { name: 'Quitar' })).toHaveLength(5);
      expect(screen.getAllByRole('button', { name: 'Subir' })).toHaveLength(4);
    });

    it('still confirms before removing a block', async () => {
      const { handlers, ui } = setup(wide);
      await render(ui);

      await fireEvent.press(screen.getAllByRole('button', { name: 'Quitar' })[2]);
      expect(screen.getByText('El bloque 3 sale del plan cuando lo guardes.')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Quitar bloque' }));
      expect(handlers.onRemoveBlock).toHaveBeenCalledWith('b3');
    });

    it('fills each card with its phase colour and names the phase in text', async () => {
      await render(setup(wide).ui);

      const list = within(screen.getByTestId('builder-list'));
      expect(list.getByText('Calentamiento', { includeHiddenElements: true })).toBeOnTheScreen();
      expect(list.getAllByTestId('block-card')[1]).toHaveStyle({ backgroundColor: colors.light.coral });
    });

    it('titles the panel with the position of the block being edited, following it when it moves', async () => {
      const [first, second, ...rest] = blocks;
      const { rerender } = await render(setup({ ...wide, editingId: 'b2' }).ui);
      const panel = within(screen.getByTestId('builder-panel'));
      expect(panel.getByRole('header', { name: 'Editando el bloque 2' })).toBeOnTheScreen();

      await rerender(setup({ ...wide, blocks: [second, first, ...rest], editingId: 'b2' }).ui);

      expect(panel.getByRole('header', { name: 'Editando el bloque 1' })).toBeOnTheScreen();
      expect(panel.queryByRole('header', { name: 'Editando el bloque 2' })).toBeNull();
      // The panel still edits the same block: its phase is the one selected.
      expect(panel.getByRole('radio', { name: 'Principal', checked: true })).toBeOnTheScreen();
    });

    it('shows the no-selection state, not an empty panel, when the block being edited is gone', async () => {
      const { rerender } = await render(setup({ ...wide, editingId: 'b2' }).ui);

      await rerender(setup({ ...wide, blocks: blocks.filter((block) => block.id !== 'b2'), editingId: 'b2' }).ui);

      const panel = within(screen.getByTestId('builder-panel'));
      expect(panel.getByText('Elige un bloque para editarlo')).toBeOnTheScreen();
      expect(panel.queryByRole('header')).toBeNull();
      expect(panel.queryByLabelText('Fase')).toBeNull();
    });
  });

  describe('the block being edited', () => {
    const outline = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>);

    it.each([400, 1024])('is outlined with the ink token and no other card is at %i dp', async (width) => {
      await render(setup({ width, editingId: 'b2' }).ui);

      const cards = screen.getAllByTestId('block-card');
      expect(outline(cards[1])).toMatchObject({ borderWidth: 2, borderColor: colors.light.ink });
      expect(outline(cards[0])).toMatchObject({ borderWidth: 2, borderColor: 'transparent' });
      expect(outline(cards[2])).toMatchObject({ borderWidth: 2, borderColor: 'transparent' });
    });

    it('keeps the same card height and padding with or without the outline', async () => {
      await render(setup({ width: 1024 }).ui);
      const idle = outline(screen.getAllByTestId('block-card')[1]);
      await screen.unmount();

      await render(setup({ width: 1024, editingId: 'b2' }).ui);
      const editing = outline(screen.getAllByTestId('block-card')[1]);

      expect({ ...editing, borderColor: undefined }).toEqual({ ...idle, borderColor: undefined });
    });

    it('moves the outline with the block', async () => {
      const [first, second, ...rest] = blocks;
      const { rerender } = await render(setup({ width: 1024, editingId: 'b2' }).ui);

      await rerender(setup({ width: 1024, blocks: [second, first, ...rest], editingId: 'b2' }).ui);

      const cards = screen.getAllByTestId('block-card');
      expect(outline(cards[0])).toMatchObject({ borderColor: colors.light.ink });
      expect(outline(cards[1])).toMatchObject({ borderColor: 'transparent' });
    });

    it('keeps the ink border and the 2 dp focus ring of a control inside the card as two separate styles', async () => {
      await render(setup({ width: 1024, editingId: 'b2' }).ui);
      const card = screen.getAllByTestId('block-card')[1];

      await fireEvent(within(card).getByRole('button', { name: 'Subir' }), 'focus');

      // The ring is an outline on the focused button, 2 dp off its edge, inside the card padding; the card keeps its border and gets no outline.
      expect(outline(within(screen.getAllByTestId('block-card')[1]).getByRole('button', { name: 'Subir' }))).toMatchObject({
        outlineColor: colors.light.focus,
        outlineWidth: 2,
        outlineOffset: 2,
      });
      const flat = outline(screen.getAllByTestId('block-card')[1]);
      expect(flat).toMatchObject({ borderWidth: 2, borderColor: colors.light.ink });
      expect(flat).not.toHaveProperty('outlineWidth');
    });

    it('has no outlined card when nothing is being edited', async () => {
      await render(setup({ width: 1024 }).ui);

      for (const card of screen.getAllByTestId('block-card')) expect(outline(card)).toMatchObject({ borderColor: 'transparent' });
    });
  });

  describe('assign', () => {
    it('has no assign button when the caller offers none', async () => {
      await render(setup().ui);

      expect(screen.queryByRole('button', { name: 'Asignar' })).toBeNull();
    });

    it.each([400, 1200])('hands over to the assign flow from the button at %i dp', async (width) => {
      const onAssign = jest.fn();
      await render(setup({ width, onAssign }).ui);

      await fireEvent.press(screen.getByRole('button', { name: 'Asignar' }));

      expect(onAssign).toHaveBeenCalledTimes(1);
    });

    it.each([400, 1200])('keeps the button visible but disabled, with the reason, while assigning is blocked at %i dp', async (width) => {
      const onAssign = jest.fn();
      await render(setup({ width, onAssign, assignBlocked: true }).ui);

      const button = screen.getByRole('button', { name: 'Asignar · Guarda el plan para asignarlo' });
      expect(button).toBeOnTheScreen();
      expect(button).toBeDisabled();
      expect(button.props.accessibilityState).toMatchObject({ disabled: true });

      await fireEvent.press(button);
      expect(onAssign).not.toHaveBeenCalled();
    });
  });

  it('has no template button when the caller offers none', async () => {
    await render(setup({ onSaveTemplate: undefined }).ui);

    expect(screen.queryByRole('button', { name: 'Guardar como plantilla' })).toBeNull();
  });

  it('shows a loading button while saving and ignores presses', async () => {
    const { handlers, ui } = setup({ saving: 'plan' });
    await render(ui);

    const save = screen.getByRole('button', { name: 'Guardar plan' });
    expect(save).toBeBusy();
    await fireEvent.press(save);
    expect(handlers.onSave).not.toHaveBeenCalled();
  });

  describe('plan name', () => {
    it('edits the name from its field', async () => {
      const { handlers, ui } = setup();
      await render(ui);

      expect(screen.getByLabelText('Nombre del plan').props.value).toBe('Resistencia aeróbica');
      await fireEvent.changeText(screen.getByLabelText('Nombre del plan'), 'Velocidad');
      expect(handlers.onChangeName).toHaveBeenCalledWith('Velocidad');
    });

    it('titles an unnamed plan "Plan nuevo"', async () => {
      await render(setup({ planName: '  ' }).ui);

      expect(screen.getByRole('header', { name: 'Plan nuevo' })).toBeOnTheScreen();
    });

    it('shows the name error only when asked to', async () => {
      await render(setup({ nameError: true }).ui);
      expect(screen.getByText('Escribe un nombre para el plan.')).toBeOnTheScreen();
    });
  });

  it('announces a result message politely', async () => {
    await render(setup({ message: { kind: 'success', text: 'Plan guardado.' } }).ui);

    expect(screen.getByText('Plan guardado.')).toBeOnTheScreen();
    expect(screen.getByTestId('banner').parent?.props.accessibilityLiveRegion).toBe('polite');
  });

  describe('removing a block', () => {
    it('asks first and removes nothing when the user keeps the block', async () => {
      const { handlers, ui } = setup();
      await render(ui);
      expect(screen.queryByText('¿Quitar este bloque?')).toBeNull();

      await fireEvent.press(screen.getAllByRole('button', { name: 'Quitar' })[2]);
      expect(screen.getByText('¿Quitar este bloque?')).toBeOnTheScreen();
      expect(screen.getByText('El bloque 3 sale del plan cuando lo guardes.')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Conservar bloque' }));
      expect(handlers.onRemoveBlock).not.toHaveBeenCalled();
      expect(screen.queryByText('¿Quitar este bloque?')).toBeNull();
    });

    it('removes the block once confirmed', async () => {
      const { handlers, ui } = setup();
      await render(ui);

      await fireEvent.press(screen.getAllByRole('button', { name: 'Quitar' })[2]);
      await fireEvent.press(screen.getByRole('button', { name: 'Quitar bloque' }));

      expect(handlers.onRemoveBlock).toHaveBeenCalledWith('b3');
      expect(screen.queryByText('¿Quitar este bloque?')).toBeNull();
    });

    it('offers Quitar on every block and hides it for the block being edited', async () => {
      await render(setup({ editingId: 'b2' }).ui);

      expect(screen.getAllByRole('button', { name: 'Quitar' })).toHaveLength(4);
    });
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
    expect(within(primary[0]).getByText('Guardar plan')).toBeOnTheScreen();
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

    it('changes the distance and the stroke', async () => {
      const { handlers, ui } = setup({ editingId: 'b2' });
      await render(ui);

      await fireEvent.press(within(screen.getByLabelText('Distancia')).getByRole('radio', { name: '100 m' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...editing, distance: 100 });

      await fireEvent.press(within(screen.getByLabelText('Estilo o ejercicio')).getByRole('radio', { name: 'Espalda' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...editing, activity: 'BK' });
    });

    it('selects the stroke and leaves the drill field empty', async () => {
      await render(setup({ editingId: 'b2' }).ui);

      expect(within(screen.getByLabelText('Estilo o ejercicio')).getByRole('radio', { checked: true })).toHaveAccessibleName('Libre');
      expect(screen.getByLabelText('Ejercicio técnico').props.value).toBe('');
    });

    it('shows a drill in its field with no stroke selected, and typing replaces the activity', async () => {
      const { handlers, ui } = setup({ editingId: 'b3' });
      await render(ui);

      expect(within(screen.getByLabelText('Estilo o ejercicio')).queryByRole('radio', { checked: true })).toBeNull();
      expect(screen.getByLabelText('Ejercicio técnico').props.value).toBe('Patada');
      expect(screen.getByLabelText('Ejercicio técnico').props.maxLength).toBe(120);
      expect(screen.getByLabelText('Ejercicio técnico').props.accessibilityHint).toBe('Escríbelo si no es un estilo. Máximo 120 caracteres.');

      await fireEvent.changeText(screen.getByLabelText('Ejercicio técnico'), 'Patada con tabla');
      expect(handlers.onChangeBlock).toHaveBeenCalledWith({ ...blocks[2], activity: 'Patada con tabla' });
    });

    it('shows the activity errors on the drill field', async () => {
      await render(setup({ editingId: 'b2', editingErrors: { activity: 'required' } }).ui);
      expect(screen.getByText('Elige un estilo o escribe un ejercicio técnico.')).toBeOnTheScreen();

      await render(setup({ editingId: 'b2', editingErrors: { activity: 'too_long' } }).ui);
      expect(screen.getByText('Usa máximo 120 caracteres.')).toBeOnTheScreen();
    });

    it('starts without a recording selected and shows its error only when asked to', async () => {
      const draft = { ...editing, recording: null };
      await render(setup({ blocks: [draft], editingId: 'b2' }).ui);

      expect(within(screen.getByLabelText('Qué se registra')).queryByRole('radio', { checked: true })).toBeNull();
      expect(screen.queryByText('Elige qué se registra en este bloque.')).toBeNull();
      expect(screen.queryByText(/^Registro:/)).toBeNull();

      await render(setup({ blocks: [draft], editingId: 'b2', editingErrors: { recording: 'required' } }).ui);
      expect(screen.getByText('Elige qué se registra en este bloque.')).toBeOnTheScreen();
    });

    it('toggles the equipment', async () => {
      const { handlers, ui } = setup({ editingId: 'b2' });
      await render(ui);

      expect(screen.getByRole('checkbox', { name: 'Paletas' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Tabla' })).not.toBeChecked();

      await fireEvent.press(screen.getByRole('checkbox', { name: 'Tabla' }));
      expect(handlers.onChangeBlock).toHaveBeenLastCalledWith({ ...editing, equipment: ['paddles', 'kickboard'] });

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

describe('PlanBuilderScreen editor on a phase fill', () => {
  const phaseList: BlockPhase[] = ['warm_up', 'main', 'technique', 'cool_down'];
  // The editor draws these on its own container: labels, help, field errors and the stepper values.
  const editorTexts: ColorToken[] = ['ink', 'ink-muted', 'danger-text'];

  it.each(phaseList)('seats the %s editor on a surface-1 panel, not on the phase fill', async (phase) => {
    await render(setup({ blocks: [{ ...blocks[1], phase }], editingId: 'b2' }).ui);

    expect(screen.getByTestId('block-editor-panel')).toHaveStyle({ backgroundColor: colors.light['surface-1'] });
    expect(screen.getByTestId('block-card')).toHaveStyle({ backgroundColor: colors.light[phaseColors[phase].background] });
  });

  it.each(['light', 'dark'] as ThemeName[])('keeps 4.5:1 contrast for every editor text on the panel in %s theme', (theme) => {
    for (const token of editorTexts) {
      expect(contrastRatio(colors[theme][token], colors[theme]['surface-1'])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
