import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [], endedAt: null }];
const OPTIMISTIC = 'Estimación optimista; la mayoría pierde ritmo al final';

// Synthetic 100 m in a 25 m pool with marks at 25/50/75 m. Noon UTC stays the same calendar day everywhere.
const time: FamilyMeasurement = {
  id: 'm1',
  athleteId: 'a1',
  createdBy: 'u1',
  stroke: 'FR',
  distance: '100m',
  pool: 'SCM',
  sessionType: 'training',
  competition: null,
  capturedAt: '2026-11-14T12:00:00.000Z',
  millis: 72_400,
  splits: [17_100, 35_300, 53_900],
  officialMillis: null,
  officialSetAt: null,
};

async function openDetail(measurement: FamilyMeasurement) {
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'hundredths' })}>
      <FamilyTimingContainer userId="u1" athletes={athletes} repository={createInMemoryFamilyMeasurementRepository([measurement])} onBack={jest.fn()} />
    </PreferencesProvider>,
  );
  await fireEvent.press(await screen.findByText('100 m libre'));
}

describe('pace and projection in the detail of a saved time', () => {
  it('shows the pace, the halves, the consistency and the projection with the meters of lapMeters for a time without split_meters', async () => {
    await openDetail(time);

    expect(screen.getByText('Ritmo y proyección')).toBeTruthy();
    expect(screen.getByText('0–25 m · 0:17,10 · 1:08,40 / 100 m')).toBeTruthy();
    expect(screen.getByText('75–100 m · 0:18,50 · 1:14,00 / 100 m')).toBeTruthy();
    expect(screen.getByText('1.ª mitad 0:35,30 · 2.ª mitad 0:37,10 · +0:01,80')).toBeTruthy();
    expect(screen.getByText(/^Consistencia \d+,\d %$/)).toBeTruthy();
    // 53,90 s at 75 m plus 25 m at the pace after the start segment: (53,90 - 17,10) s / 50 m.
    expect(screen.getByText('Si mantiene este ritmo: 1:12,30')).toBeTruthy();
    expect(screen.getByText(OPTIMISTIC)).toBeTruthy();
  });

  it('uses the saved meters of the marks when the time has them', async () => {
    await openDetail({ ...time, splitMeters: [20, 45, 80] });

    expect(screen.getByText('0–20 m · 0:17,10 · 1:25,50 / 100 m')).toBeTruthy();
    expect(screen.getByText('45–80 m · 0:18,60 · 0:53,14 / 100 m')).toBeTruthy();
  });

  it('shows no projection when only one mark has meters, and ignores the marks without them', async () => {
    await openDetail({ ...time, splits: [17_100, 35_300, 53_900], splitMeters: [null, 50, null] });

    expect(screen.getByText('Ritmo y proyección')).toBeTruthy();
    expect(screen.getByText('0–50 m · 0:35,30 · 1:10,60 / 100 m')).toBeTruthy();
    expect(screen.queryByText(/Si mantiene este ritmo/)).toBeNull();
    expect(screen.queryByText(OPTIMISTIC)).toBeNull();
  });

  it('shows nothing for a time without marks', async () => {
    await openDetail({ ...time, splits: [] });
    expect(screen.queryByText('Ritmo y proyección')).toBeNull();
  });
});

describe('pace and projection when a free-laps time is stopped', () => {
  it('shows them under the marks, with the meters of the pool, once stopped', async () => {
    const ms = (n: number) => BigInt(n) * 1_000_000n;
    let now = 0n;
    await render(
      <PreferencesProvider
        repository={createInMemoryPreferencesRepository({
          ...defaultPreferences,
          freeLaps: true,
          timePrecision: 'hundredths',
          timingButtons: { ...defaultPreferences.timingButtons, enabled: false },
        })}
      >
        <FamilyTimingContainer userId="u1" athletes={athletes} repository={createInMemoryFamilyMeasurementRepository()} onBack={jest.fn()} now={() => now} />
      </PreferencesProvider>,
    );
    await fireEvent.press(await screen.findByText('Medir un tiempo'));
    await fireEvent.press(screen.getByText('100 m'));
    await fireEvent.press(screen.getByText('Piscina de 25 m'));
    await fireEvent.press(screen.getByText('Ir al cronómetro'));
    await fireEvent.press(screen.getByText('Iniciar'));
    expect(screen.queryByText('Ritmo y proyección')).toBeNull();
    for (const t of [16_720, 35_120, 54_000]) {
      now = ms(t);
      await fireEvent.press(screen.getByText('Lap'));
    }
    now = ms(72_310);
    await fireEvent.press(screen.getByText('Detener'));

    expect(screen.getByText('Ritmo y proyección')).toBeTruthy();
    expect(screen.getByText('0–25 m · 0:16,72 · 1:06,88 / 100 m')).toBeTruthy();
    expect(screen.getByText(/^Si mantiene este ritmo: /)).toBeTruthy();
    expect(screen.getByText(OPTIMISTIC)).toBeTruthy();
  });
});
