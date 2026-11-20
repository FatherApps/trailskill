import { render, screen } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));

const base: FamilyMeasurement = {
  id: 'm1',
  athleteId: 'a1',
  createdBy: 'u1',
  stroke: 'BK',
  distance: '50m',
  pool: 'SCM',
  sessionType: 'training',
  competition: null,
  capturedAt: '2026-11-01T14:00:00.000Z',
  millis: 44_710,
  splits: [22_000],
  officialMillis: null,
  officialSetAt: null,
};

const lucia = { id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [] };
const tomas = { id: 'a2', firstName: 'Tomás', lastName: 'Rey', categoryId: null, groupIds: [] };

async function setup({ athletes = [lucia], authorized }: { athletes?: (typeof lucia)[]; authorized?: ReadonlySet<string> } = {}) {
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'hundredths' })}>
      <FamilyTimingContainer
        userId="u1"
        athletes={athletes}
        authorizedAthleteIds={authorized}
        repository={createInMemoryFamilyMeasurementRepository([base])}
        onBack={jest.fn()}
      />
    </PreferencesProvider>,
  );
  await screen.findByText('Medir un tiempo');
}

describe('compact Mis tiempos list', () => {
  it('shows the swimmer card with the full name and «Autorizado», without chips for a single swimmer', async () => {
    await setup({ authorized: new Set(['a1']) });

    expect(screen.getByText('Lucía Rojas')).toBeTruthy();
    expect(screen.getByLabelText('Autorizado')).toBeTruthy();
    expect(screen.queryByLabelText(/Lucía R\./)).toBeNull();
  });

  it('says the authorization is pending, and shows no tag while it is unknown', async () => {
    await setup({ authorized: new Set() });
    expect(screen.getByLabelText('Autorización pendiente')).toBeTruthy();
    await screen.unmount();

    await setup();
    expect(screen.queryByLabelText('Autorizado')).toBeNull();
    expect(screen.queryByLabelText('Autorización pendiente')).toBeNull();
  });

  it('keeps the chips to switch swimmers when there are several', async () => {
    await setup({ athletes: [lucia, tomas] });
    expect(screen.getByLabelText(/Lucía R\./)).toBeTruthy();
    expect(screen.getByLabelText(/Tomás R\./)).toBeTruthy();
    expect(screen.getByText('Lucía Rojas')).toBeTruthy();
  });

  it('shows a row with the event, pool and type, date, time and lengths', async () => {
    await setup();
    expect(screen.getByText('50 m espalda')).toBeTruthy();
    expect(screen.getByText('Piscina de 25 m · Entrenamiento')).toBeTruthy();
    expect(screen.getByText('44,71')).toBeTruthy();
    expect(screen.getByText('Medido · 2 largos')).toBeTruthy();
    expect(screen.getByText('Toca un registro para ver sus parciales')).toBeTruthy();
  });
});
