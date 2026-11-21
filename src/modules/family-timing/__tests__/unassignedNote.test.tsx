import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [] }];

const training: FamilyMeasurement = {
  id: 'm1',
  athleteId: 'a1',
  createdBy: 'u1',
  stroke: 'FL',
  distance: '50m',
  pool: 'SCM',
  sessionType: 'training',
  competition: null,
  capturedAt: '2026-11-08T14:00:00.000Z',
  millis: 47_210,
  splits: [],
  officialMillis: null,
  officialSetAt: null,
};

async function setup(initial: FamilyMeasurement[] = []) {
  const repository = createInMemoryFamilyMeasurementRepository(initial);
  let now = 0n;
  const clock = { set: (ms: number) => (now = BigInt(ms) * 1_000_000n) };
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'thousandths' })}>
      <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} onBack={jest.fn()} now={() => now} />
    </PreferencesProvider>,
  );
  return { repository, clock };
}

async function openEdit() {
  await fireEvent.press((await screen.findAllByHintText('Abre el detalle del tiempo'))[0]);
  await fireEvent.press(await screen.findByText('Editar registro'));
}

describe('a time of someone else\'s child: "Sin asignar" with a note (issue #1300)', () => {
  it('moves a time of my swimmer to "Sin asignar" with a note, and shows the note in the list', async () => {
    const { repository } = await setup([training]);
    await openEdit();
    // The note shows only once the time is "Sin asignar".
    expect(screen.queryByText('Nota')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Sin asignar'));
    await fireEvent.changeText(screen.getByLabelText('Nota'), '  Juan, hijo de Pedro ');
    await fireEvent.press(screen.getByText('Guardar cambios'));
    await waitFor(async () => expect(await repository.listByAthlete(null)).toEqual([expect.objectContaining({ id: 'm1', note: 'Juan, hijo de Pedro' })]));
    expect(await repository.listByAthlete('a1')).toEqual([]);
    expect(await screen.findByText(/^Juan, hijo de Pedro · /)).toBeTruthy();
  });

  it('drops the note when the time goes back to my swimmer', async () => {
    const { repository } = await setup([{ ...training, athleteId: null, note: 'Ana' }]);
    await fireEvent.press(await screen.findByLabelText('Sin asignar'));
    await openEdit();
    expect(screen.getByLabelText('Nota').props.value).toBe('Ana');
    await fireEvent.press(screen.getByLabelText('Lucía R.'));
    expect(screen.queryByLabelText('Nota')).toBeNull();
    await fireEvent.press(screen.getByText('Guardar cambios'));
    await waitFor(async () => expect((await repository.listByAthlete('a1'))[0]).toMatchObject({ id: 'm1', note: null }));
  });

  it('measures for my swimmer by default, or for "Sin asignar" with a note chosen before starting', async () => {
    const { repository, clock } = await setup();
    const measure = async (choose?: () => Promise<void>) => {
      await fireEvent.press(await screen.findByText('Medir un tiempo'));
      await choose?.();
      await fireEvent.press(screen.getByText('Piscina de 25 m'));
      await fireEvent.press(screen.getByText('Ir al cronómetro'));
      clock.set(1000);
      await fireEvent.press(screen.getByText('Iniciar'));
      clock.set(1000 + 40_000);
      await fireEvent.press(screen.getByText('Detener'));
      await fireEvent.press(screen.getByText('Guardar'));
    };
    await measure();
    await waitFor(async () => expect(await repository.listByAthlete('a1')).toHaveLength(1));

    await measure(async () => {
      await fireEvent.press(screen.getByLabelText('Sin asignar'));
      await fireEvent.changeText(screen.getByLabelText('Nota'), 'Luis');
    });
    await waitFor(async () => expect(await repository.listByAthlete(null)).toEqual([expect.objectContaining({ note: 'Luis', millis: 40_000 })]));
    // The list now shows "Sin asignar", where the time went.
    expect(await screen.findByText(/^Luis · /)).toBeTruthy();

    // The next time goes to my swimmer again, even from the "Sin asignar" list.
    await measure();
    await waitFor(async () => expect(await repository.listByAthlete('a1')).toHaveLength(2));
  });
});
