import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createInMemoryStaffSchoolRepository } from '../../school-console';
import { BlockHasFulfillmentError } from '../data/plans';
import { createInMemoryTrainingPlanRepository } from '../data/inMemoryTrainingPlanRepository';
import { PlanEditorScreen } from '../screens/PlanEditorScreen';
import { planVocabulary } from '../vocabulary';

// The school-console barrel pulls in the native PowerSync database; these tests use the in-memory repositories only.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
// The native module is absent under Jest: a counter gives each id a distinct value.
let mockUuids = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuids}` }));

const SCHOOL = 'school-1';
const vocabulary = planVocabulary();

type BlockSpec = {
  phase: string;
  repetitions?: number;
  distance?: string;
  stroke?: string;
  drill?: string;
  equipment?: string[];
  sendOffSteps?: number;
  recording?: string;
};

function setup(memberships = [{ schoolId: SCHOOL, schoolName: 'Escuela Sintética', userId: 'coach-1', role: 'coach' }]) {
  const repository = createInMemoryTrainingPlanRepository();
  const schools = createInMemoryStaffSchoolRepository(memberships);
  const onSaved = jest.fn();
  const onAssign = jest.fn();
  const element = (planId: string | null) => (
    <PlanEditorScreen
      planId={planId}
      repository={repository}
      schools={schools}
      userId="coach-1"
      vocabulary={vocabulary}
      onSaved={onSaved}
      onAssign={onAssign}
    />
  );
  return { repository, onSaved, onAssign, element };
}

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const choose = (group: string, option: string) =>
  fireEvent.press(within(screen.getByLabelText(group)).getByRole('radio', { name: option }));
const summaries = () => screen.getAllByText(/^\d+ × \d+ m /).map((node) => node.props.children);

async function addBlock(spec: BlockSpec) {
  await press('Agregar bloque');
  await choose('Fase', spec.phase);
  for (let i = 1; i < (spec.repetitions ?? 1); i++) await press('Sumar una repetición');
  if (spec.distance) await choose('Distancia', spec.distance);
  if (spec.stroke) await choose('Estilo o ejercicio', spec.stroke);
  if (spec.drill) await fireEvent.changeText(screen.getByLabelText('Ejercicio técnico'), spec.drill);
  for (const item of spec.equipment ?? []) await fireEvent.press(screen.getByRole('checkbox', { name: item }));
  for (let i = 0; i < (spec.sendOffSteps ?? 0); i++) await press('Sumar 5 segundos');
  if (spec.recording) await choose('Qué se registra', spec.recording);
  await press('Listo');
}

const nameIt = (name: string) => fireEvent.changeText(screen.getByLabelText('Nombre del plan'), name);

const everyField: BlockSpec[] = [
  { phase: 'Calentamiento', repetitions: 2, distance: '100 m', stroke: 'Libre', equipment: ['Aletas', 'Paletas'], sendOffSteps: 2, recording: 'Solo cumplimiento' },
  { phase: 'Principal', repetitions: 4, distance: '50 m', stroke: 'Espalda', recording: 'Tiempo por repetición' },
  { phase: 'Técnica', repetitions: 3, distance: '25 m', drill: 'Patada con tabla', equipment: ['Tabla'], sendOffSteps: 3, recording: 'Total de la serie' },
  { phase: 'Enfriamiento', distance: '200 m', stroke: 'Combinado', recording: 'Solo cumplimiento' },
];

async function createPlan(ctx: ReturnType<typeof setup>, name: string, specs: BlockSpec[]) {
  await render(ctx.element(null));
  await screen.findByLabelText('Nombre del plan');
  await nameIt(name);
  for (const spec of specs) await addBlock(spec);
  await press('Guardar plan');
  await screen.findByText('Plan guardado.');
  return ctx.onSaved.mock.calls.at(-1)![0] as string;
}

describe('PlanEditorScreen', () => {
  it('creates a plan with blocks covering every field and shows it again when reopened', async () => {
    const ctx = setup();
    const id = await createPlan(ctx, 'Resistencia aeróbica', everyField);
    expect(ctx.onSaved).toHaveBeenCalledTimes(1);

    await screen.unmount();
    await render(ctx.element(id));
    await screen.findByText('4 bloques');

    expect(screen.getByLabelText('Nombre del plan').props.value).toBe('Resistencia aeróbica');
    expect(summaries()).toEqual(['2 × 100 m Libre', '4 × 50 m Espalda', '3 × 25 m Patada con tabla', '1 × 200 m Combinado']);
    expect(screen.getByText('Implementos: Aletas, Paletas')).toBeOnTheScreen();
    expect(screen.getByText('Implementos: Tabla')).toBeOnTheScreen();
    expect(screen.getByText('Salida cada 0:10')).toBeOnTheScreen();
    expect(screen.getByText('Salida cada 0:15')).toBeOnTheScreen();
    for (const phase of ['Calentamiento', 'Principal', 'Técnica', 'Enfriamiento'])
      expect(screen.getByLabelText(phase)).toBeOnTheScreen();
    expect(screen.getAllByText('Registro: solo cumplimiento')).toHaveLength(2);
    expect(screen.getByText('Registro: un tiempo por repetición')).toBeOnTheScreen();
    expect(screen.getByText('Registro: total de la serie')).toBeOnTheScreen();
  });

  it('writes the plan under the first school of the user, trimmed, as a plan and not a template', async () => {
    const ctx = setup();
    const id = await createPlan(ctx, '  Resistencia  ', [everyField[0]]);

    await expect(ctx.repository.get(id)).resolves.toMatchObject({ schoolId: SCHOOL, name: 'Resistencia', isTemplate: false });
  });

  it('keeps a moved block in its new position after saving and reopening', async () => {
    const ctx = setup();
    const id = await createPlan(ctx, 'Orden', everyField.slice(0, 3));

    await fireEvent.press(screen.getAllByRole('button', { name: 'Subir' })[1]); // third block up
    expect(summaries()[1]).toBe('3 × 25 m Patada con tabla');
    await press('Guardar plan');
    await screen.findByText('Plan guardado.');

    await screen.unmount();
    await render(ctx.element(id));
    await screen.findByText('3 bloques');
    expect(summaries()).toEqual(['2 × 100 m Libre', '3 × 25 m Patada con tabla', '4 × 50 m Espalda']);
  });

  it('removes a block only after confirming, and it stays gone after reopening', async () => {
    const ctx = setup();
    const id = await createPlan(ctx, 'Quitar', everyField.slice(0, 3));

    await fireEvent.press(screen.getAllByRole('button', { name: 'Quitar' })[1]);
    expect(screen.getByText('¿Quitar este bloque?')).toBeOnTheScreen();
    expect(screen.getByText('El bloque 2 sale del plan cuando lo guardes.')).toBeOnTheScreen();

    await press('Conservar bloque');
    expect(summaries()).toHaveLength(3);

    await fireEvent.press(screen.getAllByRole('button', { name: 'Quitar' })[1]);
    await press('Quitar bloque');
    expect(summaries()).toEqual(['2 × 100 m Libre', '3 × 25 m Patada con tabla']);
    await press('Guardar plan');
    await screen.findByText('Plan guardado.');

    await screen.unmount();
    await render(ctx.element(id));
    await screen.findByText('2 bloques');
    expect(summaries()).toEqual(['2 × 100 m Libre', '3 × 25 m Patada con tabla']);
  });

  it('changes an existing plan without creating a new one', async () => {
    const ctx = setup();
    const id = await createPlan(ctx, 'Antes', [everyField[0]]);

    await screen.unmount();
    await render(ctx.element(id));
    await screen.findByText('1 bloque');
    await nameIt('Después');
    await press('Guardar plan');
    await screen.findByText('Plan guardado.');

    await expect(ctx.repository.list(SCHOOL)).resolves.toEqual([{ id, name: 'Después', isTemplate: false }]);
  });

  describe('validation', () => {
    async function startNewPlan(name = 'Plan de prueba') {
      const ctx = setup();
      await render(ctx.element(null));
      await screen.findByLabelText('Nombre del plan');
      await nameIt(name);
      return ctx;
    }
    const nothingWritten = async (ctx: ReturnType<typeof setup>) => {
      await expect(ctx.repository.list(SCHOOL)).resolves.toEqual([]);
      expect(ctx.onSaved).not.toHaveBeenCalled();
    };

    it('does not save a block without what is recorded and shows the field error', async () => {
      const ctx = await startNewPlan();
      await press('Agregar bloque');
      await choose('Estilo o ejercicio', 'Libre');

      expect(screen.queryByText('Elige qué se registra en este bloque.')).toBeNull();
      expect(within(screen.getByLabelText('Qué se registra')).queryByRole('radio', { checked: true })).toBeNull();

      await press('Guardar plan');

      expect(screen.getByText('Elige qué se registra en este bloque.')).toBeOnTheScreen();
      expect(screen.getByText('Revisa los campos marcados antes de guardar.')).toBeOnTheScreen();
      expect(screen.queryByText('Plan guardado.')).toBeNull();
      await nothingWritten(ctx);

      await choose('Qué se registra', 'Solo cumplimiento');
      expect(screen.queryByText('Elige qué se registra en este bloque.')).toBeNull();
    });

    it('does not save a block with neither a stroke nor a drill', async () => {
      const ctx = await startNewPlan();
      await press('Agregar bloque');
      await choose('Qué se registra', 'Solo cumplimiento');
      await press('Listo');
      await press('Guardar plan');

      // The invalid block is reopened in the editor with its error.
      expect(screen.getByText('Elige un estilo o escribe un ejercicio técnico.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Listo' })).toBeOnTheScreen();
      await nothingWritten(ctx);
    });

    it('limits the drill to 120 characters and rejects a longer draft', async () => {
      const ctx = await startNewPlan();
      await press('Agregar bloque');
      expect(screen.getByLabelText('Ejercicio técnico').props.maxLength).toBe(120);

      await fireEvent.changeText(screen.getByLabelText('Ejercicio técnico'), 'a'.repeat(121));
      await choose('Qué se registra', 'Solo cumplimiento');
      await press('Guardar plan');

      expect(screen.getByText('Usa máximo 120 caracteres.')).toBeOnTheScreen();
      await nothingWritten(ctx);
    });

    it('requires a name', async () => {
      const ctx = await startNewPlan('   ');
      await addBlock(everyField[0]);
      await press('Guardar plan');

      expect(screen.getByText('Escribe un nombre para el plan.')).toBeOnTheScreen();
      await nothingWritten(ctx);
    });

    it('swaps the stroke for a drill and back', async () => {
      await startNewPlan();
      await press('Agregar bloque');

      await choose('Estilo o ejercicio', 'Libre');
      expect(screen.getByLabelText('Ejercicio técnico').props.value).toBe('');

      await fireEvent.changeText(screen.getByLabelText('Ejercicio técnico'), 'Patada');
      expect(within(screen.getByLabelText('Estilo o ejercicio')).queryByRole('radio', { checked: true })).toBeNull();

      await choose('Estilo o ejercicio', 'Pecho');
      expect(screen.getByLabelText('Ejercicio técnico').props.value).toBe('');
      expect(within(screen.getByLabelText('Estilo o ejercicio')).getByRole('radio', { checked: true })).toHaveAccessibleName('Pecho');
    });
  });

  describe('templates', () => {
    it('saves the plan first and then a template with the same name', async () => {
      const ctx = setup();
      await render(ctx.element(null));
      await screen.findByLabelText('Nombre del plan');
      await nameIt('Base aeróbica');
      await addBlock(everyField[1]);
      expect(screen.queryByRole('button', { name: 'Guardar como plantilla' })).toBeOnTheScreen();

      await press('Guardar como plantilla');
      await screen.findByText('Plantilla guardada.');

      const list = await ctx.repository.list(SCHOOL);
      expect(list.map(({ name, isTemplate }) => ({ name, isTemplate })).sort((a, b) => Number(a.isTemplate) - Number(b.isTemplate))).toEqual([
        { name: 'Base aeróbica', isTemplate: false },
        { name: 'Base aeróbica', isTemplate: true },
      ]);
      const template = await ctx.repository.get(list.find((plan) => plan.isTemplate)!.id);
      expect(template!.blocks).toHaveLength(1);
      expect(template!.blocks[0]).toMatchObject({ distance: 50, activity: 'BK', recording: 'per_repetition' });
    });

    it('does not make a template from an invalid plan', async () => {
      const ctx = setup();
      await render(ctx.element(null));
      await screen.findByLabelText('Nombre del plan');
      await nameIt('Incompleto');
      await press('Agregar bloque');
      await press('Guardar como plantilla');

      expect(screen.getByText('Revisa los campos marcados antes de guardar.')).toBeOnTheScreen();
      await expect(ctx.repository.list(SCHOOL)).resolves.toEqual([]);
    });

    it('offers no template button without blocks', async () => {
      await render(setup().element(null));
      await screen.findByLabelText('Nombre del plan');

      expect(screen.queryByRole('button', { name: 'Guardar como plantilla' })).toBeNull();
    });
  });

  describe('assigning', () => {
    const BLOCKED = 'Asignar · Guarda el plan para asignarlo';
    const blocked = () => screen.getByRole('button', { name: BLOCKED });
    const enabled = () => screen.getByRole('button', { name: 'Asignar' });

    it('is disabled, and says why, for a new plan that was never saved', async () => {
      const ctx = setup();
      await render(ctx.element(null));
      await screen.findByLabelText('Nombre del plan');

      expect(blocked()).toBeDisabled();
      expect(blocked().props.accessibilityState).toMatchObject({ disabled: true });
      await fireEvent.press(blocked());
      expect(ctx.onAssign).not.toHaveBeenCalled();
      expect(ctx.onSaved).not.toHaveBeenCalled();
    });

    it('is enabled once the plan is saved, and hands over its id without saving or assigning anything itself', async () => {
      const ctx = setup();
      const id = await createPlan(ctx, 'Resistencia', [everyField[0]]);
      expect(ctx.onSaved).toHaveBeenCalledTimes(1);

      await press('Asignar');

      expect(ctx.onAssign).toHaveBeenCalledWith(id);
      expect(ctx.onAssign).toHaveBeenCalledTimes(1);
      expect(ctx.onSaved).toHaveBeenCalledTimes(1);
    });

    it('is enabled for a plan that was opened from storage and not touched', async () => {
      const ctx = setup();
      const id = await createPlan(ctx, 'Resistencia', [everyField[0]]);
      await screen.unmount();

      await render(ctx.element(id));
      await screen.findByLabelText('Nombre del plan');

      expect(enabled()).toBeEnabled();
    });

    it.each([
      ['renaming it', () => nameIt('Otro nombre')],
      ['adding a block', () => addBlock(everyField[1])],
    ])('is disabled again after %s until the plan is saved', async (_, change) => {
      const ctx = setup();
      await createPlan(ctx, 'Resistencia', [everyField[0]]);
      expect(enabled()).toBeEnabled();

      await change();
      expect(blocked()).toBeDisabled();
      await fireEvent.press(blocked());
      expect(ctx.onAssign).not.toHaveBeenCalled();

      await press('Guardar plan');
      await screen.findByText('Plan guardado.');
      expect(enabled()).toBeEnabled();
    });

    it('stays disabled when a save fails', async () => {
      const ctx = setup();
      await createPlan(ctx, 'Resistencia', [everyField[0]]);
      await nameIt('Otro nombre');
      jest.spyOn(ctx.repository, 'save').mockRejectedValueOnce(new Error('offline'));

      await press('Guardar plan');
      await screen.findByText('No pudimos guardar el plan. Inténtalo de nuevo.');

      expect(blocked()).toBeDisabled();
    });

    // Presses save without waiting for it: the press itself resolves only when the save does.
    const startSave = async () => {
      let saving!: Promise<void>;
      const button = screen.getByRole('button', { name: 'Guardar plan' });
      await act(async () => {
        saving = button.props.onClick({ stopPropagation: () => {}, nativeEvent: {} });
      });
      return { saving };
    };

    it('is enabled after changing a block and putting it back, whatever key order storage returns', async () => {
      const ctx = setup();
      const id = await createPlan(ctx, 'Resistencia', [everyField[0]]);
      await screen.unmount();
      const get = ctx.repository.get.bind(ctx.repository);
      jest.spyOn(ctx.repository, 'get').mockImplementation(async (planId) => {
        const plan = await get(planId);
        return plan && { ...plan, blocks: plan.blocks.map((block) => Object.fromEntries(Object.entries(block).reverse()) as typeof block) };
      });

      await render(ctx.element(id));
      await screen.findByLabelText('Nombre del plan');
      await press('Editar');
      await press('Sumar una repetición');
      expect(blocked()).toBeDisabled();
      await press('Quitar una repetición');

      expect(enabled()).toBeEnabled();
    });

    it('ignores a save that ends after another plan was opened', async () => {
      const ctx = setup();
      const first = await createPlan(ctx, 'Primero', [everyField[0]]);
      await screen.unmount();
      await render(ctx.element(null));
      await screen.findByLabelText('Nombre del plan');
      await nameIt('Segundo');
      await addBlock(everyField[1]);
      await press('Guardar plan');
      await screen.findByText('Plan guardado.');
      const second = ctx.onSaved.mock.calls.at(-1)![0] as string;
      await screen.unmount();

      await render(ctx.element(first));
      await screen.findByLabelText('Nombre del plan');
      await nameIt('Primero editado');
      let finish!: () => void;
      const save = ctx.repository.save.bind(ctx.repository);
      jest.spyOn(ctx.repository, 'save').mockImplementationOnce(
        (plan) => new Promise<void>((resolve) => (finish = () => resolve(save(plan)))),
      );
      const { saving } = await startSave();

      await screen.rerender(ctx.element(second));
      await screen.findByDisplayValue('Segundo');
      await act(async () => {
        finish();
        await saving;
      });

      expect(enabled()).toBeEnabled();
      expect(screen.queryByText('Plan guardado.')).toBeNull();
    });

    it('does not touch the screen when a save ends after it was closed', async () => {
      const ctx = setup();
      await render(ctx.element(null));
      await screen.findByLabelText('Nombre del plan');
      await nameIt('Cerrado');
      let finish!: () => void;
      jest.spyOn(ctx.repository, 'save').mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
      const { saving } = await startSave();
      await screen.unmount();
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});

      await act(async () => {
        finish();
        await saving;
      });

      expect(error).not.toHaveBeenCalled();
    });
  });

  describe('loading states', () => {
    it('tells a user without a school that plans need one', async () => {
      await render(setup([]).element(null));

      expect(await screen.findByText('Aún no tienes una escuela')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Nombre del plan')).toBeNull();
    });

    it('says when the plan does not exist', async () => {
      await render(setup().element('missing'));

      expect(await screen.findByText('No encontramos este plan')).toBeOnTheScreen();
    });

    it('offers a retry when the plan cannot be read', async () => {
      const ctx = setup();
      const id = await createPlan(ctx, 'Lectura', [everyField[0]]);
      await screen.unmount();
      const get = jest.spyOn(ctx.repository, 'get').mockRejectedValueOnce(new Error('offline'));

      await render(ctx.element(id));
      expect(await screen.findByText('No pudimos cargar el plan')).toBeOnTheScreen();

      await press('Intentar de nuevo');
      expect(await screen.findByText('1 bloque')).toBeOnTheScreen();
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('says the block cannot be removed when it already has fulfillment', async () => {
      const ctx = setup();
      jest.spyOn(ctx.repository, 'save').mockRejectedValueOnce(new BlockHasFulfillmentError(['b1']));
      await render(ctx.element(null));
      await screen.findByLabelText('Nombre del plan');
      await nameIt('Cumplido');
      await addBlock(everyField[0]);

      await press('Guardar plan');

      expect(await screen.findByText('Este bloque ya tiene cumplimiento registrado y no se puede quitar del plan.')).toBeOnTheScreen();
      expect(ctx.onSaved).not.toHaveBeenCalled();
    });

    it('shows the failure and keeps the draft when saving fails', async () => {
      const ctx = setup();
      jest.spyOn(ctx.repository, 'save').mockRejectedValueOnce(new Error('disk'));
      await render(ctx.element(null));
      await screen.findByLabelText('Nombre del plan');
      await nameIt('Fallo');
      await addBlock(everyField[0]);

      await press('Guardar plan');

      expect(await screen.findByText('No pudimos guardar el plan. Inténtalo de nuevo.')).toBeOnTheScreen();
      expect(ctx.onSaved).not.toHaveBeenCalled();
      expect(summaries()).toHaveLength(1);

      await press('Guardar plan');
      expect(await screen.findByText('Plan guardado.')).toBeOnTheScreen();
    });
  });

  describe('on a tablet, with a block open in the editing panel', () => {
    const realGet = Dimensions.get.bind(Dimensions);
    afterEach(() => jest.restoreAllMocks());

    async function openFirstOfTwo() {
      jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), width: 1024, height: 768 }));
      const ctx = setup();
      await render(ctx.element(null));
      await screen.findByLabelText('Nombre del plan');
      await addBlock(everyField[0]);
      await addBlock(everyField[1]);
      await fireEvent.press(screen.getAllByRole('button', { name: 'Editar' })[0]);
      expect(screen.getByRole('header', { name: 'Editando el bloque 1' })).toBeOnTheScreen();
    }

    it('keeps editing the same block, under its new position, when it moves', async () => {
      await openFirstOfTwo();

      await fireEvent.press(screen.getAllByRole('button', { name: 'Bajar' })[0]);

      expect(summaries()).toEqual(['4 × 50 m Espalda', '2 × 100 m Libre']);
      expect(screen.getByRole('header', { name: 'Editando el bloque 2' })).toBeOnTheScreen();
      expect(within(screen.getByTestId('builder-panel')).getByRole('radio', { name: 'Calentamiento', checked: true })).toBeOnTheScreen();
    });

    it('shows the no-selection state when the block being edited is removed', async () => {
      await openFirstOfTwo();

      await fireEvent.press(screen.getAllByRole('button', { name: 'Quitar' })[0]);
      await press('Quitar bloque');

      expect(summaries()).toEqual(['4 × 50 m Espalda']);
      const panel = within(screen.getByTestId('builder-panel'));
      expect(panel.getByText('Elige un bloque para editarlo')).toBeOnTheScreen();
      expect(panel.queryByRole('header')).toBeNull();
    });

    it('keeps the open block when another block is removed', async () => {
      await openFirstOfTwo();

      await fireEvent.press(screen.getAllByRole('button', { name: 'Quitar' })[1]);
      await press('Quitar bloque');

      expect(screen.getByRole('header', { name: 'Editando el bloque 1' })).toBeOnTheScreen();
    });
  });
});
