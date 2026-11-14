import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

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
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ themeMode: 'system', timePrecision: precision })}>
      <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} onBack={jest.fn()} now={() => now} />
    </PreferencesProvider>,
  );
  return { repository, clock };
}

describe('FamilyTimingContainer', () => {
  it('measures a training time and keeps it on the phone with thousandths', async () => {
    const { repository, clock } = await setup();
    await fireEvent.press(await screen.findByText('Medir un tiempo'));
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
      <PreferencesProvider repository={createInMemoryPreferencesRepository({ themeMode: 'system', timePrecision: 'thousandths' })}>
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
