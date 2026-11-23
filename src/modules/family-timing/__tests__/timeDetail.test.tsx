import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [], endedAt: null }];

// Noon UTC stays the same calendar day in every time zone the tests run in.
const withLaps: FamilyMeasurement = {
  id: 'm1',
  athleteId: 'a1',
  createdBy: 'u1',
  stroke: 'FR',
  distance: '100m',
  pool: 'SCM',
  sessionType: 'competition',
  competition: 'Festival de prueba',
  capturedAt: '2026-11-14T12:00:00.000Z',
  millis: 72_400,
  splits: [17_100, 35_300, 53_900],
  officialMillis: null,
  officialSetAt: null,
};

async function open(times: FamilyMeasurement[]) {
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'hundredths' })}>
      <FamilyTimingContainer userId="u1" athletes={athletes} repository={createInMemoryFamilyMeasurementRepository(times)} onBack={jest.fn()} />
    </PreferencesProvider>,
  );
}

// Issue #1002: touching a saved time opens everything known about it, its laps included.
describe('the detail of a saved time', () => {
  it('shows each lap with its own time and the total, and the session information', async () => {
    await open([withLaps]);
    await fireEvent.press(await screen.findByText('100 m libre'));

    expect(screen.getByText('Detalle del tiempo')).toBeTruthy();
    expect(screen.getByText('Parciales')).toBeTruthy();
    expect(screen.getByText('4 largos · 100 m')).toBeTruthy();
    // Each length: its distance, its own time and the total at its end.
    for (const distance of ['25 m', '50 m', '75 m']) expect(screen.getByText(distance)).toBeTruthy();
    expect(screen.getAllByText('0:17,10')).toHaveLength(2);
    expect(screen.getByText('0:18,20')).toBeTruthy();
    expect(screen.getByText('0:35,30')).toBeTruthy();
    expect(screen.getByText('0:53,90')).toBeTruthy();
    expect(screen.getAllByText('1:12,40')).toHaveLength(2);
    expect(screen.getByText('Largo 3, el más lento: +1,50 s')).toBeTruthy();
    expect(screen.getAllByLabelText('Lucía R.').length).toBeGreaterThan(0);
    expect(screen.getByText('Festival de prueba')).toBeTruthy();
    expect(screen.getAllByLabelText('Competencia').length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByText('Volver a la lista'));
    expect(await screen.findByText('Medir un tiempo')).toBeTruthy();
  });

  it('counts each marked lap as one length and the last one as the rest, after the distance was corrected', async () => {
    // Set up as 50 m, marked at 25 m, stopped at 100 m, then corrected to 100 m in training.
    await open([{ ...withLaps, sessionType: 'training', competition: null, splits: [16_000], millis: 70_000 }]);
    await fireEvent.press(await screen.findByText('100 m libre'));

    expect(screen.getByText('25 m')).toBeTruthy();
    expect(screen.getByText('100 m')).toBeTruthy();
    expect(screen.queryByText('50 m')).toBeNull();
    expect(screen.getByText('0:54,00')).toBeTruthy();
  });

  it('shows a time without laps with no laps section, and reaches the official time from there', async () => {
    await open([{ ...withLaps, distance: '25m', splits: [], millis: 16_900 }]);
    await fireEvent.press(await screen.findByText('25 m libre'));

    expect(screen.queryByText('Parciales')).toBeNull();
    await fireEvent.press(screen.getByText('Poner tiempo oficial'));
    expect(await screen.findByLabelText('Tiempo oficial')).toBeTruthy();
  });
});
