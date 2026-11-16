import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [] }];

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
    await fireEvent.press(await screen.findByText('Libre 100 m · Piscina de 25 m'));

    expect(screen.getByText('Detalle del tiempo')).toBeTruthy();
    expect(screen.getByText('Lap 1 · 0:17,10 · total 0:17,10')).toBeTruthy();
    expect(screen.getByText('Lap 2 · 0:18,20 · total 0:35,30')).toBeTruthy();
    expect(screen.getByText('Lap 3 · 0:18,60 · total 0:53,90')).toBeTruthy();
    expect(screen.getByText('Lap 4 · 0:18,50 · total 1:12,40')).toBeTruthy();
    expect(screen.getByText('Lucía Rojas')).toBeTruthy();
    expect(screen.getByText('Festival de prueba')).toBeTruthy();
    expect(screen.getAllByText('Competencia').length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByText('Volver a la lista'));
    expect(await screen.findByText('Medir un tiempo')).toBeTruthy();
  });

  it('shows a time without laps with no laps section, and reaches the official time from there', async () => {
    await open([{ ...withLaps, distance: '25m', splits: [], millis: 16_900 }]);
    await fireEvent.press(await screen.findByText('Libre 25 m · Piscina de 25 m'));

    expect(screen.queryByText('Vueltas')).toBeNull();
    await fireEvent.press(screen.getByText('Poner tiempo oficial'));
    expect(await screen.findByLabelText('Tiempo oficial')).toBeTruthy();
  });
});
