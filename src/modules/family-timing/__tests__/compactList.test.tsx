import { render, screen } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));

const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();
const clockOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Today's 50 m back (with a split, so 2 lengths), a competition 3 days ago, and one 20 days ago.
const today: FamilyMeasurement = {
  id: 'm1',
  athleteId: 'a1',
  createdBy: 'u1',
  stroke: 'BK',
  distance: '50m',
  pool: 'SCM',
  sessionType: 'training',
  competition: null,
  capturedAt: at(0),
  millis: 44_710,
  splits: [22_000],
  officialMillis: null,
  officialSetAt: null,
};
const lastDays: FamilyMeasurement = { ...today, id: 'm2', stroke: 'FR', sessionType: 'competition', competition: 'Festival', capturedAt: at(3), millis: 51_230, splits: [] };
const older: FamilyMeasurement = { ...today, id: 'm3', stroke: 'BR', capturedAt: at(20), millis: 60_100, splits: [] };

const lucia = { id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [], endedAt: null };
const tomas = { id: 'a2', firstName: 'Tomás', lastName: 'Rey', categoryId: null, groupIds: [], endedAt: null };

async function setup({ athletes = [lucia], times = [today, lastDays, older] }: { athletes?: (typeof lucia)[]; times?: FamilyMeasurement[] } = {}) {
  const repository = createInMemoryFamilyMeasurementRepository(times);
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'hundredths' })}>
      <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} onBack={jest.fn()} />
    </PreferencesProvider>,
  );
  await screen.findByText('Medir un tiempo');
  return repository;
}

describe('compact Mis tiempos list', () => {
  it('groups the rows in one card under «Hoy», «Esta semana» and «Antes»', async () => {
    await setup();
    expect(screen.getByText('Hoy')).toBeTruthy();
    expect(screen.getByText('Esta semana')).toBeTruthy();
    expect(screen.getByText('Antes')).toBeTruthy();
    expect(screen.queryByText('Más recientes')).toBeNull();
    expect(screen.queryByText('Toca un registro para ver sus parciales')).toBeNull();
  });

  it('gives each row two lines: the time of day for today, the date after, with the short type, the pool and the lengths', async () => {
    await setup();
    expect(screen.getByText('50 m espalda')).toBeTruthy();
    expect(screen.getByText(`${clockOf(today.capturedAt)} · Entreno · 25 m · 2 largos`)).toBeTruthy();
    expect(screen.getByText(/ · Comp\. · 25 m$/)).toBeTruthy();
    // The row and the aqua card of the best time of today.
    expect(screen.getAllByText('44,71')).toHaveLength(2);
    expect(screen.queryByText('Medido · 2 largos')).toBeNull();
  });

  it('marks the best time with a trophy instead of a tag, and a video, authorization or action does not show in the row', async () => {
    await setup();
    expect(screen.getAllByLabelText('Mejor tiempo').length).toBeGreaterThan(0);
    expect(screen.queryByText('Mejor tiempo')).toBeNull();
    expect(screen.queryByLabelText('Ver video')).toBeNull();
    expect(screen.queryByText('Autorizado')).toBeNull();
    expect(screen.queryByText('Autorización pendiente')).toBeNull();
    expect(screen.queryByText('Poner tiempo oficial')).toBeNull();
  });

  it('shows the aqua card with the best time of today and the times of the week', async () => {
    await setup();
    expect(screen.getByText('Mejor de hoy · 50 m espalda')).toBeTruthy();
    expect(screen.getByText('2 tiempos')).toBeTruthy();
  });

  it('shows no aqua card when no time was set today', async () => {
    await setup({ times: [lastDays, older] });
    expect(screen.queryByText(/Mejor de hoy/)).toBeNull();
  });

  it('shows the swimmer chips with one swimmer and with several', async () => {
    await setup();
    expect(screen.getByLabelText(/Lucía R\./)).toBeTruthy();
    expect(screen.queryByText('Lucía Rojas')).toBeNull();
    await screen.unmount();

    await setup({ athletes: [lucia, tomas] });
    expect(screen.getByLabelText(/Lucía R\./)).toBeTruthy();
    expect(screen.getByLabelText(/Tomás R\./)).toBeTruthy();
  });

  it('shows «Eliminados (1)» as a link under the card', async () => {
    await setup({ times: [today, { ...older, id: 'm4', deletedAt: at(1) }] });
    expect(screen.getByText('Eliminados (1)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Eliminados (1)' })).toBeTruthy();
  });
});
