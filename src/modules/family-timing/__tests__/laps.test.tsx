import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository } from '../data/familyMeasurements';
import { idleFamilyStopwatch, splitAt, splitMillis, startAt, finalMillis } from '../domain/familyStopwatch';
import { lapsFor } from '../domain/laps';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

const ms = (n: number) => BigInt(n) * 1_000_000n;

describe('lapsFor', () => {
  it('counts the lengths of the pool', () => {
    expect(lapsFor('100m', 'SCM')).toBe(4);
    expect(lapsFor('100m', 'LCM')).toBe(2);
    expect(lapsFor('1500m', 'LCM')).toBe(30);
  });

  it('is one lap when the event is not longer than the pool', () => {
    expect(lapsFor('50m', 'LCM')).toBe(1);
    expect(lapsFor('25m', 'SCM')).toBe(1);
    expect(lapsFor('25m', 'LCM')).toBe(1);
  });
});

describe('splitAt with laps', () => {
  it('stops on the mark that closes the last lap', () => {
    let sw = startAt(idleFamilyStopwatch, ms(0));
    sw = splitAt(sw, ms(15_000), 2);
    expect(sw.status).toBe('running');
    sw = splitAt(sw, ms(32_000), 2);
    expect(sw.status).toBe('stopped');
    expect(splitMillis(sw)).toEqual([15_000]);
    expect(finalMillis(sw)).toBe(32_000);
  });
});

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [], endedAt: null }];

async function open() {
  const repository = createInMemoryFamilyMeasurementRepository();
  let now = 0n;
  const clock = { set: (value: number) => (now = ms(value)) };
  await render(
    <PreferencesProvider
      repository={createInMemoryPreferencesRepository({
        ...defaultPreferences,
        timePrecision: 'hundredths',
        timingButtons: { ...defaultPreferences.timingButtons, enabled: false },
      })}
    >
      <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} onBack={jest.fn()} now={() => now} />
    </PreferencesProvider>,
  );
  await fireEvent.press(await screen.findByText('Medir un tiempo'));
  return { repository, clock };
}

describe('laps in the individual time', () => {
  it('waits for the pool before the stopwatch', async () => {
    await open();
    await fireEvent.press(screen.getByText('Ir al cronómetro · elige la piscina'));
    expect(screen.queryByText('Iniciar')).toBeNull();
    await fireEvent.press(screen.getByText('Piscina de 25 m'));
    await fireEvent.press(screen.getByText('Ir al cronómetro'));
    expect(screen.getByText('Iniciar')).toBeTruthy();
  });

  it('times 100 m in a 25 m pool as 4 laps and stops on the fourth', async () => {
    const { repository, clock } = await open();
    await fireEvent.press(screen.getByText('100 m'));
    await fireEvent.press(screen.getByText('Piscina de 25 m'));
    await fireEvent.press(screen.getByText('Ir al cronómetro'));
    await fireEvent.press(screen.getByText('Iniciar'));
    expect(screen.getByText('Lap 1 de 4')).toBeTruthy();
    for (const [i, at] of [16_720, 35_120, 54_000].entries()) {
      clock.set(at);
      await fireEvent.press(screen.getByText('Lap'));
      expect(screen.getByText(`Lap ${i + 2} de 4`)).toBeTruthy();
    }
    clock.set(72_310);
    await fireEvent.press(screen.getByText('Lap'));

    expect(screen.queryByText('Lap')).toBeNull();
    expect(screen.getByText('Lap 2 · 0:18,40 · total 0:35,12')).toBeTruthy();
    expect(screen.getByText('Lap 4 · 0:18,31 · total 1:12,31')).toBeTruthy();
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(async () => expect((await repository.listByAthlete('a1'))[0]).toMatchObject({ millis: 72_310, splits: [16_720, 35_120, 54_000], pool: 'SCM' }));
    expect(await screen.findByText(/ · Entreno · 25 m · 4 largos$/)).toBeTruthy();
  });

  it('offers no lap button when the event is one length', async () => {
    await open();
    await fireEvent.press(screen.getByText('Piscina de 50 m'));
    await fireEvent.press(screen.getByText('Ir al cronómetro'));
    await fireEvent.press(screen.getByText('Iniciar'));
    expect(screen.queryByText('Lap')).toBeNull();
    expect(screen.queryByText(/de 1$/)).toBeNull();
    expect(screen.getByText('Detener')).toBeTruthy();
  });
});
