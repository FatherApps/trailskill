import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));

const athletes = [
  { id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [], endedAt: null },
  { id: 'a2', firstName: 'Tomás', lastName: 'Rojas', categoryId: null, groupIds: [], endedAt: null },
];

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

async function setup(initial: FamilyMeasurement[]) {
  const repository = createInMemoryFamilyMeasurementRepository(initial);
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'thousandths' })}>
      <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} onBack={jest.fn()} />
    </PreferencesProvider>,
  );
  return repository;
}


// The edit screen opens from the time's detail ("Editar registro").
async function openDetail(index = 0) {
  await fireEvent.press((await screen.findAllByHintText('Abre el detalle del tiempo'))[index]);
}
async function openEdit(index = 0) {
  await openDetail(index);
  await fireEvent.press(await screen.findByText('Editar registro'));
}

describe('editing and deleting a family time', () => {
  it('corrects the stroke and keeps the captured time', async () => {
    const repository = await setup([training]);
    await openEdit();
    await fireEvent.press(screen.getByText('Espalda'));
    await fireEvent.press(screen.getByText('Guardar cambios'));
    await waitFor(async () => expect((await repository.listByAthlete('a1'))[0]).toMatchObject({ stroke: 'BK', millis: 47_210 }));
    expect(await screen.findByText('Medir un tiempo')).toBeTruthy();
  });

  it('corrects the distance of a training time and keeps the captured time', async () => {
    const repository = await setup([training]);
    await openEdit();
    expect(screen.getByLabelText('Distancia')).toBeTruthy();
    await fireEvent.press(screen.getByText('100 m'));
    await fireEvent.press(screen.getByText('Guardar cambios'));
    await waitFor(async () => expect((await repository.listByAthlete('a1'))[0]).toMatchObject({ distance: '100m', stroke: 'FL', millis: 47_210 }));
    expect(await screen.findByText('100 m mariposa')).toBeTruthy();
  });

  it('does not offer the distance on a competition time', async () => {
    await setup([{ ...training, sessionType: 'competition', competition: 'Festival' }]);
    await openEdit();
    expect(screen.getByText('Guardar cambios')).toBeTruthy();
    expect(screen.queryByLabelText('Distancia')).toBeNull();
  });

  it('moves a time to another of my swimmers and shows that swimmer', async () => {
    const repository = await setup([training]);
    await openEdit();
    await fireEvent.press(screen.getByLabelText('Tomás R.'));
    await fireEvent.press(screen.getByText('Guardar cambios'));
    await waitFor(async () => expect((await repository.listByAthlete('a2')).map((m) => m.id)).toEqual(['m1']));
    expect(await repository.listByAthlete('a1')).toEqual([]);
    expect(await screen.findByText('47,210')).toBeTruthy();
  });

  it('deletes only after confirming, and restores from Eliminados', async () => {
    const repository = await setup([training]);
    await openEdit();
    await fireEvent.press(screen.getByText('Eliminar tiempo'));
    await fireEvent.press(screen.getByText('Conservar'));
    expect(await repository.listByAthlete('a1')).toHaveLength(1);

    await fireEvent.press(screen.getByText('Eliminar tiempo'));
    await fireEvent.press(screen.getAllByText('Eliminar tiempo').at(-1)!);
    await waitFor(async () => expect(await repository.listByAthlete('a1')).toEqual([]));

    await fireEvent.press(await screen.findByText('Eliminados (1)'));
    expect(screen.getByText(/^Se borra el /)).toBeTruthy();
    await fireEvent.press(screen.getByText('Recuperar'));
    await waitFor(async () => expect((await repository.listByAthlete('a1')).map((m) => m.id)).toEqual(['m1']));
    expect(await screen.findByText('No hay tiempos eliminados')).toBeTruthy();
  });
});
