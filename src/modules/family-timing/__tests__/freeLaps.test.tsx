import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createFakeTimingButton } from '../../timing';
import { createInMemoryFamilyMeasurementRepository } from '../data/familyMeasurements';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

const ms = (n: number) => BigInt(n) * 1_000_000n;

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [], endedAt: null }];

// 100 m in a 25 m pool with the free laps on, timed on screen (the buttons are off).
async function open(freeLaps = true) {
  const repository = createInMemoryFamilyMeasurementRepository();
  let now = 0n;
  const at = (value: number) => (now = ms(value));
  await render(
    <PreferencesProvider
      repository={createInMemoryPreferencesRepository({
        ...defaultPreferences,
        freeLaps,
        timePrecision: 'hundredths',
        timingButtons: { ...defaultPreferences.timingButtons, enabled: false },
      })}
    >
      <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} onBack={jest.fn()} now={() => now} />
    </PreferencesProvider>,
  );
  await fireEvent.press(await screen.findByText('Medir un tiempo'));
  await fireEvent.press(screen.getByText('100 m'));
  await fireEvent.press(screen.getByText('Piscina de 25 m'));
  await fireEvent.press(screen.getByText('Ir al cronómetro'));
  return { repository, at };
}

const saved = async (repository: ReturnType<typeof createInMemoryFamilyMeasurementRepository>) => (await repository.listByAthlete('a1'))[0];

describe('free laps in the individual time', () => {
  it('takes a fifth mark in 100 m of a 25 m pool and does not stop by itself', async () => {
    const { at } = await open();
    await fireEvent.press(screen.getByText('Iniciar'));
    for (const [i, time] of [16_720, 35_120, 54_000, 72_310, 90_000].entries()) {
      at(time);
      await fireEvent.press(screen.getByText('Lap'));
      expect(screen.getByText('Detener')).toBeTruthy();
      expect(screen.getAllByText(/^Lap \d+ · .* · total /)).toHaveLength(i + 1);
    }
    // No "Lap 1 de 4": there is no cap to count towards. A mark shows its running total, no meters.
    expect(screen.queryByText(/^Lap \d+ de /)).toBeNull();
    expect(screen.getByText('Lap 5 · 0:17,69 · total 1:30,00')).toBeTruthy();
    expect(screen.queryByText(/^Lap \d+ · .* m$/)).toBeNull();
  });

  it('is stopped by the stop button and saves the meters of the pool, k x its length', async () => {
    const { repository, at } = await open();
    await fireEvent.press(screen.getByText('Iniciar'));
    for (const time of [16_720, 35_120, 54_000]) {
      at(time);
      await fireEvent.press(screen.getByText('Lap'));
    }
    at(72_310);
    await fireEvent.press(screen.getByText('Detener'));
    await fireEvent.press(screen.getByText('Guardar'));
    // Marks at 25, 50 and 75 m; the final one is the whole distance, kept in the measurement.
    await waitFor(async () =>
      expect(await saved(repository)).toMatchObject({ distance: '100m', millis: 72_310, splits: [16_720, 35_120, 54_000], splitMeters: [25, 50, 75] }),
    );
  });

  it('leaves the marks that reach the distance without meters', async () => {
    const { repository, at } = await open();
    await fireEvent.press(screen.getByText('Iniciar'));
    for (const time of [16_720, 35_120, 54_000, 72_310, 90_000]) {
      at(time);
      await fireEvent.press(screen.getByText('Lap'));
    }
    at(100_000);
    await fireEvent.press(screen.getByText('Detener'));
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(async () => expect((await saved(repository))?.splitMeters).toEqual([25, 50, 75, null, null]));
  });

  it('offers the meters review only once stopped with marks', async () => {
    const { at } = await open();
    await fireEvent.press(screen.getByText('Iniciar'));
    at(16_720);
    await fireEvent.press(screen.getByText('Lap'));
    expect(screen.queryByText('Revisar metros')).toBeNull();
    at(30_000);
    await fireEvent.press(screen.getByText('Detener'));
    expect(screen.getByText('Revisar metros')).toBeTruthy();
  });

  it('offers no review when there are no marks, and saves no meters', async () => {
    const { repository, at } = await open();
    await fireEvent.press(screen.getByText('Iniciar'));
    at(72_310);
    await fireEvent.press(screen.getByText('Detener'));
    expect(screen.queryByText('Revisar metros')).toBeNull();
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(async () => expect(await saved(repository)).toMatchObject({ millis: 72_310, splits: [], splitMeters: null }));
  });

  describe('the optional review', () => {
    async function stoppedWithThreeMarks() {
      const { repository, at } = await open();
      await fireEvent.press(screen.getByText('Iniciar'));
      for (const time of [16_720, 35_120, 54_000]) {
        at(time);
        await fireEvent.press(screen.getByText('Lap'));
      }
      at(72_310);
      await fireEvent.press(screen.getByText('Detener'));
      await fireEvent.press(screen.getByText('Revisar metros'));
      return repository;
    }
    const field = (lap: number) => screen.getByLabelText(new RegExp(`^Metros hasta Lap ${lap} `));

    it('starts from the meters of the pool and can be left without touching anything', async () => {
      const repository = await stoppedWithThreeMarks();
      expect(field(1).props.value).toBe('25');
      expect(field(3).props.value).toBe('75');
      await fireEvent.press(screen.getByText('Listo'));
      await fireEvent.press(screen.getByText('Guardar'));
      await waitFor(async () => expect((await saved(repository))?.splitMeters).toEqual([25, 50, 75]));
    });

    it('saves a mark corrected to 30 m as 30', async () => {
      const repository = await stoppedWithThreeMarks();
      await fireEvent.changeText(field(1), '30');
      await fireEvent.press(screen.getByText('Listo'));
      await fireEvent.press(screen.getByText('Guardar'));
      await waitFor(async () => expect((await saved(repository))?.splitMeters).toEqual([30, 50, 75]));
    });

    it('saves a cleared mark as no meters (never 0)', async () => {
      const repository = await stoppedWithThreeMarks();
      await fireEvent.changeText(field(2), '');
      await fireEvent.press(screen.getByText('Listo'));
      await fireEvent.press(screen.getByText('Guardar'));
      await waitFor(async () => expect((await saved(repository))?.splitMeters).toEqual([25, null, 75]));
    });

    it.each([
      ['100', 'Los metros deben ser más de 0 y menos de 100 m.'],
      ['0', 'Los metros deben ser más de 0 y menos de 100 m.'],
      ['60', 'Los metros deben ir en aumento de un parcial al siguiente.'],
    ])('does not accept %s as the meters of the first mark', async (text, message) => {
      const repository = await stoppedWithThreeMarks();
      await fireEvent.changeText(field(1), text);
      await fireEvent.press(screen.getByText('Listo'));
      expect(screen.getByText(message)).toBeTruthy();
      // Still on the review: nothing was taken.
      expect(screen.queryByText('Guardar')).toBeNull();
      await fireEvent.press(screen.getByLabelText('Volver'));
      await fireEvent.press(screen.getByText('Guardar'));
      await waitFor(async () => expect((await saved(repository))?.splitMeters).toEqual([25, 50, 75]));
    });

    it('goes back to the stopped time, unchanged, with back', async () => {
      await stoppedWithThreeMarks();
      await fireEvent.changeText(field(1), '30');
      await fireEvent.press(screen.getByLabelText('Volver'));
      expect(screen.getByText('Guardar')).toBeTruthy();
      expect(screen.getByText('Lap 3 · 0:18,88 · total 0:54,00')).toBeTruthy();
    });
  });

  it('keeps the restricted stopwatch with the free laps off: stops on the last lap and saves no meters', async () => {
    const { repository, at } = await open(false);
    await fireEvent.press(screen.getByText('Iniciar'));
    expect(screen.getByText('Lap 1 de 4')).toBeTruthy();
    for (const time of [16_720, 35_120, 54_000, 72_310]) {
      at(time);
      await fireEvent.press(screen.getByText('Lap'));
    }
    expect(screen.queryByText('Detener')).toBeNull();
    expect(screen.queryByText('Revisar metros')).toBeNull();
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(async () => expect(await saved(repository)).toMatchObject({ millis: 72_310, splits: [16_720, 35_120, 54_000], splitMeters: null }));
  });
});

describe('free laps with the timing buttons', () => {
  it('takes marks past the last lap with the split key and stops with the start key', async () => {
    const fake = createFakeTimingButton(ms(10_000));
    const repository = createInMemoryFamilyMeasurementRepository();
    await render(
      <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, freeLaps: true, timePrecision: 'thousandths' })}>
        <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} buttons={fake.port} onBack={jest.fn()} />
      </PreferencesProvider>,
    );
    await fireEvent.press(await screen.findByText('Medir un tiempo'));
    await fireEvent.press(screen.getByText('100 m'));
    await fireEvent.press(screen.getByText('Piscina de 25 m'));
    await fireEvent.press(screen.getByText('Ir al cronómetro'));
    const press = (keyCode: number) => act(async () => void fake.press(keyCode));

    await press(24);
    for (let i = 0; i < 5; i++) {
      fake.advance(ms(15_000));
      await press(25);
    }
    expect(screen.getByText('Detener')).toBeTruthy();
    fake.advance(ms(12_000));
    await press(24);
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(async () => expect(await saved(repository)).toMatchObject({ millis: 87_000, splitMeters: [25, 50, 75, null, null] }));
  });
});
