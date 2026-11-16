import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createFakeTimingButton } from '../../timing';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

const ms = (n: number) => BigInt(n) * 1_000_000n;

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [] }];

const competition: FamilyMeasurement = {
  id: 'm1',
  athleteId: 'a1',
  createdBy: 'u1',
  stroke: 'FL',
  distance: '50m',
  pool: 'SCM',
  sessionType: 'competition',
  competition: 'Festival de prueba',
  capturedAt: '2026-11-08T14:00:00.000Z',
  millis: 47_210,
  splits: [],
  officialMillis: null,
  officialSetAt: null,
};

async function setup(initial: FamilyMeasurement[] = [], precision: 'hundredths' | 'thousandths' = 'thousandths') {
  const repository = createInMemoryFamilyMeasurementRepository(initial);
  let now = 0n;
  const clock = { set: (ms: number) => (now = BigInt(ms) * 1_000_000n) };
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: precision })}>
      <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} onBack={jest.fn()} now={() => now} />
    </PreferencesProvider>,
  );
  return { repository, clock };
}

describe('FamilyTimingContainer', () => {
  it('measures a training time and keeps it on the phone with thousandths', async () => {
    const { repository, clock } = await setup();
    await fireEvent.press(await screen.findByText('Medir un tiempo'));
    await fireEvent.press(screen.getByText('Piscina de 25 m'));
    await fireEvent.press(screen.getByText('Ir al cronómetro'));
    clock.set(1000);
    await fireEvent.press(screen.getByText('Iniciar'));
    clock.set(1000 + 65_372);
    await fireEvent.press(screen.getByText('Detener'));
    await fireEvent.press(screen.getByText('Guardar'));

    await waitFor(async () => expect(await repository.listByAthlete('a1')).toHaveLength(1));
    expect((await repository.listByAthlete('a1'))[0]).toMatchObject({ millis: 65_372, sessionType: 'training', officialMillis: null });
    expect(await screen.findByText('1:05,372')).toBeTruthy();
  });

  it('shows hundredths, truncated, when Ajustes says so', async () => {
    await setup([{ ...competition, millis: 47_219 }], 'hundredths');
    expect(await screen.findByText('47,21')).toBeTruthy();
  });

  it('types the official time of a competition and keeps the captured one as history', async () => {
    const { repository } = await setup([competition]);
    await fireEvent.press(await screen.findByText('Poner tiempo oficial'));
    await fireEvent.changeText(screen.getByLabelText('Tiempo oficial'), '42,71');
    await fireEvent.press(screen.getByText('Guardar oficial'));

    await waitFor(async () => expect((await repository.listByAthlete('a1'))[0]?.officialMillis).toBe(42_710));
    expect((await repository.listByAthlete('a1'))[0]?.millis).toBe(47_210);
    expect(await screen.findByText('Medido (histórico, no oficial)')).toBeTruthy();
    expect(screen.getByText('42,710')).toBeTruthy();
  });

  it('refuses an unreadable official time', async () => {
    await setup([competition]);
    await fireEvent.press(await screen.findByText('Poner tiempo oficial'));
    await fireEvent.changeText(screen.getByLabelText('Tiempo oficial'), 'abc');
    await fireEvent.press(screen.getByText('Guardar oficial'));
    expect(screen.getByText('Escribe un tiempo como 42,71 o 1:05,372.')).toBeTruthy();
  });

  it('offers no official time on training', async () => {
    await setup([{ ...competition, sessionType: 'training', competition: null }]);
    await screen.findByText('Medido');
    expect(screen.queryByText('Poner tiempo oficial')).toBeNull();
  });
});

describe('FamilyTimingContainer with imported results', () => {
  it('shows the imported official result over the hand-typed one, and the captured time as history', async () => {
    const repository = createInMemoryFamilyMeasurementRepository([{ ...competition, capturedAt: '2026-11-08T12:00:00.000Z', officialMillis: 42_800 }]);
    const imports = {
      listByAthlete: async () => [{ id: 'r1', provider: 'co-fecna', stroke: 'FL', distance: '50m', pool: 'SCM', hundredths: 4271, swumOn: '2026-11-08' }],
    };
    await render(
      <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'thousandths' })}>
        <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} imports={imports} sourceNames={{ 'co-fecna': 'Federación de prueba' }} onBack={jest.fn()} />
      </PreferencesProvider>,
    );
    expect(await screen.findByLabelText('Oficial · Federación de prueba')).toBeTruthy();
    expect(screen.getByText('42,71')).toBeTruthy();
    expect(screen.getByText('Medido (histórico, no oficial)')).toBeTruthy();
    expect(screen.getByText('47,210')).toBeTruthy();
    expect(screen.queryByText('Cambiar tiempo oficial')).toBeNull();
    // The hand-typed value stays stored, untouched.
    expect((await repository.listByAthlete('a1'))[0]?.officialMillis).toBe(42_800);
  });

  // Decision 15: with two times and two official results of the same event and day, the app asks which goes with each.
  it('asks which official result goes with each of two times of the same event and day, and uses each result once', async () => {
    const heat = { id: 'r-heat', provider: 'co-fecna', sourceResultKey: 'heat', stroke: 'FL', distance: '50m', pool: 'SCM', hundredths: 4400, swumOn: '2026-11-08', competition: 'Eliminatoria' };
    const final = { ...heat, id: 'r-final', sourceResultKey: 'final', hundredths: 4280, competition: 'Final' };
    const repository = createInMemoryFamilyMeasurementRepository([
      { ...competition, id: 'm-am', capturedAt: '2026-11-08T12:00:00.000Z', millis: 44_120, officialMillis: null },
      { ...competition, id: 'm-pm', capturedAt: '2026-11-08T13:00:00.000Z', millis: 42_950, officialMillis: null },
    ]);
    await render(
      <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'thousandths' })}>
        <FamilyTimingContainer
          userId="u1"
          athletes={athletes}
          repository={repository}
          imports={{ listByAthlete: async () => [heat, final] }}
          sourceNames={{ 'co-fecna': 'Federación de prueba' }}
          onBack={jest.fn()}
        />
      </PreferencesProvider>,
    );
    // Newest first: the afternoon time is the first card.
    const ask = await screen.findAllByText('Elegir resultado oficial');
    expect(ask).toHaveLength(2);
    expect(screen.queryByLabelText('Oficial · Federación de prueba')).toBeNull();

    await fireEvent.press(ask[0]!);
    expect(screen.getByText('42,80 · Federación de prueba · Final')).toBeTruthy();
    await fireEvent.press(screen.getByText('42,80 · Federación de prueba · Final'));

    // The other time takes the last result on its own, and both now show their official result.
    expect(await screen.findAllByLabelText('Oficial · Federación de prueba')).toHaveLength(2);
    expect(screen.getByText('42,80')).toBeTruthy();
    expect(screen.getByText('44,00')).toBeTruthy();
    expect(screen.queryByText('Elegir resultado oficial')).toBeNull();
    expect(screen.getAllByText('Cambiar resultado oficial')).toHaveLength(2);
    expect((await repository.listByAthlete('a1')).find((m) => m.id === 'm-pm')?.officialResultKey).toBe('co-fecna:final');
  });

  it('still shows the guardian times when the imports cannot be read', async () => {
    const repository = createInMemoryFamilyMeasurementRepository([competition]);
    const imports = { listByAthlete: () => Promise.reject(new Error('db')) };
    await render(
      <PreferencesProvider repository={createInMemoryPreferencesRepository()}>
        <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} imports={imports} onBack={jest.fn()} />
      </PreferencesProvider>,
    );
    expect(await screen.findByText('Poner tiempo oficial')).toBeTruthy();
  });
});

describe('FamilyTimingContainer with the timing buttons', () => {
  async function withButtons(timingButtons = defaultPreferences.timingButtons) {
    const fake = createFakeTimingButton(ms(10_000));
    const repository = createInMemoryFamilyMeasurementRepository();
    await render(
      <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'thousandths', timingButtons })}>
        <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} buttons={fake.port} onBack={jest.fn()} />
      </PreferencesProvider>,
    );
    await fireEvent.press(await screen.findByText('Medir un tiempo'));
    await fireEvent.press(screen.getByText('Piscina de 25 m'));
    await fireEvent.press(screen.getByText('Ir al cronómetro'));
    const press = (keyCode: number) => act(async () => void fake.press(keyCode));
    return { fake, repository, press };
  }

  it('times with + and −: start, split, a press during the lockout, stop', async () => {
    const { fake, repository, press } = await withButtons();
    expect(fake.mode).toBe('capture');
    expect(fake.keys).toEqual([24, 25]);
    expect(screen.getByText('Subir volumen (+) inicia y detiene · Bajar volumen (−) marca el lap')).toBeTruthy();

    await press(24);
    fake.advance(ms(1_000));
    await press(24); // inside the 3 s lockout: ignored
    fake.advance(ms(14_500));
    await press(25);
    fake.advance(ms(16_123));
    await press(24);

    expect(screen.getByText('Lap 1 · 0:15,500 · total 0:15,500')).toBeTruthy();
    expect(screen.getByText('Lap 2 · 0:16,123 · total 0:31,623')).toBeTruthy();
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(async () => expect((await repository.listByAthlete('a1'))[0]).toMatchObject({ millis: 31_623, splits: [15_500] }));
    // Back on the list, the keys go back to the system.
    expect(fake.mode).toBe('off');
  });

  it('mixes a screen touch and a key press on the same clock', async () => {
    const { fake, repository, press } = await withButtons();
    await fireEvent.press(screen.getByText('Iniciar'));
    fake.advance(ms(42_710));
    await press(24);
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(async () => expect((await repository.listByAthlete('a1'))[0]?.millis).toBe(42_710));
  });

  it('leaves the keys alone when the buttons are off', async () => {
    const { fake } = await withButtons({ ...defaultPreferences.timingButtons, enabled: false });
    expect(fake.mode).toBe('off');
    expect(fake.press(24)).toBe(false);
    expect(screen.queryByText(/inicia y detiene/)).toBeNull();
  });

  it('names the connected headset', async () => {
    const { fake } = await withButtons();
    await act(async () => fake.connect([{ id: 7, name: 'USB Headset' }]));
    expect(screen.getByText('Botones: USB Headset · Subir volumen (+) inicia y detiene · Bajar volumen (−) marca el lap')).toBeTruthy();
  });
});
