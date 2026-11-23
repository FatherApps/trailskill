import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createFakeTimingButton } from '../../timing';
import { createInMemoryFamilyMeasurementRepository } from '../data/familyMeasurements';
import { arrivalMillis, newFamilySeries, pressAt, seriesStatus, undoLast } from '../domain/familySeries';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

const ms = (n: number) => BigInt(n) * 1_000_000n;


// The edit screen opens from the time's detail ("Editar registro").
async function openDetail(index = 0) {
  await fireEvent.press((await screen.findAllByHintText('Abre el detalle del tiempo'))[index]);
}
async function openEdit(index = 0) {
  await openDetail(index);
  await fireEvent.press(await screen.findByText('Editar registro'));
}

describe('familySeries', () => {
  it('keeps the size between 2 and 8', () => {
    expect(newFamilySeries(1).size).toBe(2);
    expect(newFamilySeries(12).size).toBe(8);
  });

  it('takes exactly as many arrivals as swimmers: with 4, the fifth press is ignored', () => {
    let fs = pressAt(newFamilySeries(4), ms(0));
    for (const at of [30_000, 31_250, 32_000, 33_400]) fs = pressAt(fs, ms(at));
    expect(seriesStatus(fs)).toBe('done');
    const after = pressAt(fs, ms(40_000));
    expect(after).toBe(fs);
    expect(arrivalMillis(after)).toEqual([30_000, 31_250, 32_000, 33_400]);
  });

  it('"Deshacer última" removes only the last arrival', () => {
    let fs = pressAt(newFamilySeries(3), ms(0));
    fs = pressAt(fs, ms(30_000));
    fs = pressAt(fs, ms(31_000));
    fs = undoLast(fs);
    expect(arrivalMillis(fs)).toEqual([30_000]);
    expect(seriesStatus(fs)).toBe('running');
    expect(undoLast(pressAt(newFamilySeries(2), ms(0)))).toMatchObject({ size: 2 });
  });

  it('gives no time (null, never 0) to an arrival at the very instant of the start', () => {
    const fs = pressAt(pressAt(newFamilySeries(2), ms(5)), ms(5));
    expect(arrivalMillis(fs)).toEqual([null]);
  });
});

const athletes = [
  { id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [], endedAt: null },
  { id: 'a2', firstName: 'Tomás', lastName: 'Rojas', categoryId: null, groupIds: [], endedAt: null },
];

async function openSeries(swimmers: string, timingButtons = { ...defaultPreferences.timingButtons, enabled: false }) {
  const repository = createInMemoryFamilyMeasurementRepository();
  const fake = createFakeTimingButton(0n);
  let now = 0n;
  const clock = { set: (value: number) => (now = ms(value)) };
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'hundredths', timingButtons })}>
      <FamilyTimingContainer
        userId="u1"
        athletes={athletes}
        repository={repository}
        buttons={fake.port}
        onBack={jest.fn()}
        now={timingButtons.enabled ? undefined : () => now}
      />
    </PreferencesProvider>,
  );
  await fireEvent.press(await screen.findByText('Medir un tiempo'));
  await fireEvent.press(screen.getByText('Tiempo por serie'));
  await fireEvent.press(screen.getByLabelText(swimmers));
  await fireEvent.press(screen.getByText('Piscina de 25 m'));
  await fireEvent.press(screen.getByText('Ir al cronómetro'));
  return { repository, clock, fake };
}

describe('Tiempo por serie', () => {
  it('times 4 swimmers with one start, ignores a fifth press and undoes only the last arrival', async () => {
    const { clock } = await openSeries('4');
    expect(screen.getByText('0 de 4 llegadas')).toBeTruthy();
    await fireEvent.press(screen.getByText('Iniciar'));
    for (const at of [30_000, 31_250, 32_000]) {
      clock.set(at);
      await fireEvent.press(screen.getByText('Llegada'));
    }
    clock.set(32_500);
    await fireEvent.press(screen.getByText('Llegada'));
    await fireEvent.press(screen.getByText('Deshacer última'));
    expect(screen.queryByText('4.º · 32,50')).toBeNull();
    expect(screen.getByText('3.º · 32,00')).toBeTruthy();
    clock.set(33_400);
    await fireEvent.press(screen.getByText('Llegada'));

    expect(screen.getByText('4 de 4 llegadas')).toBeTruthy();
    expect(screen.queryByText('Llegada')).toBeNull();
    expect(screen.getByText('4.º · 33,40')).toBeTruthy();
    expect(screen.getByText('Asignar nadadores')).toBeTruthy();
  });

  it('gives each arrival a swimmer and a stroke, keeps the rest as "Sin asignar", and saves them together', async () => {
    const { repository, clock } = await openSeries('3');
    await fireEvent.press(screen.getByText('Iniciar'));
    for (const at of [30_000, 31_250, 32_000]) {
      clock.set(at);
      await fireEvent.press(screen.getByText('Llegada'));
    }
    await fireEvent.press(screen.getByText('Asignar nadadores'));

    // Arrival 2 is Tomás, swimming backstroke; arrival 1 is Lucía; arrival 3 stays without a swimmer.
    await fireEvent.press(screen.getAllByLabelText('Tomás R.')[1]);
    await fireEvent.press(screen.getAllByText('Espalda')[1]);
    await fireEvent.press(screen.getAllByLabelText('Lucía R.')[0]);
    // A swimmer swims one lane: Tomás is no longer offered in the other arrivals.
    expect(screen.getAllByLabelText('Tomás R.')).toHaveLength(1);

    await fireEvent.press(screen.getByText('Guardar tiempos'));
    await waitFor(async () => expect(await repository.listByAthlete('a2')).toHaveLength(1));
    expect((await repository.listByAthlete('a2'))[0]).toMatchObject({ millis: 31_250, stroke: 'BK', pool: 'SCM', splits: [] });
    expect((await repository.listByAthlete('a1'))[0]).toMatchObject({ millis: 30_000, stroke: 'FR' });
    expect((await repository.listByAthlete(null))[0]).toMatchObject({ millis: 32_000, athleteId: null });

    // The time without a swimmer has its own chip, and can be given to one later.
    await fireEvent.press(await screen.findByLabelText('Sin asignar'));
    expect((await screen.findAllByText('32,00')).length).toBeGreaterThan(0);
    await openEdit();
    await fireEvent.press(screen.getAllByLabelText('Lucía R.').at(-1)!);
    await fireEvent.press(screen.getByText('Guardar cambios'));
    await waitFor(async () => expect(await repository.listByAthlete('a1')).toHaveLength(2));
    expect(await repository.listByAthlete(null)).toHaveLength(0);
  });

  it('only the start/stop key closes arrivals: the lap key does nothing', async () => {
    const { fake } = await openSeries('2', defaultPreferences.timingButtons);
    const press = (keyCode: number) => act(async () => void fake.press(keyCode));
    expect(screen.getByText('Subir volumen (+) da la salida y marca cada llegada')).toBeTruthy();
    await press(24);
    fake.advance(ms(30_000));
    await press(25);
    expect(screen.getByText('0 de 2 llegadas')).toBeTruthy();
    await press(24);
    fake.advance(ms(1_500));
    await press(24);
    expect(screen.getByText('2 de 2 llegadas')).toBeTruthy();
    expect(screen.getByText('2.º · 31,50')).toBeTruthy();
  });
});
