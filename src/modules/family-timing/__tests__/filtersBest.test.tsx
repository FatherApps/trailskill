import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { bestTimeIds } from '../domain/bestTimes';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));

describe('bestTimeIds', () => {
  const t = (id: string, time: number | null, capturedAt = '2026-11-01', pool = 'SCM') => ({ id, stroke: 'FR', distance: '50m', pool, capturedAt, time });

  it('takes the lowest time of each event, the first swum on a tie, and never a missing time', () => {
    expect([...bestTimeIds([t('a', 35_000), t('b', 34_000), t('c', null), t('d', 34_000, '2026-11-02')])]).toEqual(['b']);
    expect([...bestTimeIds([t('a', 35_000), t('e', 40_000, '2026-11-01', 'LCM')])].sort()).toEqual(['a', 'e']);
    expect(bestTimeIds([t('c', null)]).size).toBe(0);
  });
});

const base: FamilyMeasurement = {
  id: 'm1',
  athleteId: 'a1',
  createdBy: 'u1',
  stroke: 'FR',
  distance: '50m',
  pool: 'SCM',
  sessionType: 'training',
  competition: null,
  capturedAt: '2026-11-01T14:00:00.000Z',
  millis: 36_100,
  splits: [],
  officialMillis: null,
  officialSetAt: null,
};

const times: FamilyMeasurement[] = [
  base,
  { ...base, id: 'm2', capturedAt: '2026-11-02T14:00:00.000Z', millis: 35_400 },
  // A competition whose official time beats both captured ones: the official time is the record.
  { ...base, id: 'm3', capturedAt: '2026-11-03T14:00:00.000Z', sessionType: 'competition', millis: 35_900, officialMillis: 35_200, officialSetAt: '2026-11-03T15:00:00.000Z' },
  { ...base, id: 'm4', capturedAt: '2026-11-04T14:00:00.000Z', stroke: 'BK', millis: 41_000 },
];

const lucia = { id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [], endedAt: null };

async function setup(athletes = [lucia], all = times) {
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'hundredths' })}>
      <FamilyTimingContainer
        userId="u1"
        athletes={athletes}
        repository={createInMemoryFamilyMeasurementRepository(all)}
        onBack={jest.fn()}
      />
    </PreferencesProvider>,
  );
  await screen.findByText('Medir un tiempo');
}

// Stroke, distance and pool are chosen in the sheet and applied together.
async function filterBy(label: string) {
  await fireEvent.press(screen.getByLabelText('Filtros'));
  await fireEvent.press(screen.getByLabelText(label));
  await fireEvent.press(screen.getByText('Aplicar filtros'));
}

const bestCount = () => screen.queryAllByLabelText('Mejor tiempo').length;

describe('filters and best time in Mis tiempos', () => {
  it('marks the best of each event, counting the official time', async () => {
    await setup();
    expect(bestCount()).toBe(2);
    expect(screen.getAllByText(/^50 m libre$/)).toHaveLength(3);
  });

  it('shows training only, and the best among them', async () => {
    await setup();
    await fireEvent.press(screen.getByText('Entrenos'));
    expect(screen.queryByText('35,20')).toBeNull();
    expect(screen.getAllByText(/^50 m (libre|espalda)$/)).toHaveLength(3);
    expect(bestCount()).toBe(2);
    await fireEvent.press(screen.getByText('Competencias'));
    expect(screen.getAllByText(/^50 m [a-z]+$/)).toHaveLength(1);
  });

  it('filters by stroke and says when nothing matches', async () => {
    await setup();
    await filterBy('Espalda');
    expect(screen.getAllByText(/^50 m [a-z]+$/)).toHaveLength(1);
    expect(screen.getByLabelText('Filtros (1)')).toBeTruthy();
    await fireEvent.press(screen.getByText('Competencias'));
    expect(screen.getByText('Ningún tiempo con estos filtros')).toBeTruthy();
  });

  it('does not keep a stroke filter the next swimmer has no time for', async () => {
    const mateo = { id: 'a2', firstName: 'Mateo', lastName: 'Gil', categoryId: null, groupIds: [], endedAt: null };
    await setup([lucia, mateo], [...times, { ...base, id: 'm5', athleteId: 'a2', millis: 38_000 }]);
    await filterBy('Espalda');
    await fireEvent.press(screen.getByLabelText('Mateo G.'));
    expect(await screen.findByText(/^50 m libre$/)).toBeTruthy();
    expect(screen.queryByText('Ningún tiempo con estos filtros')).toBeNull();
  });

  it('keeps the filters when the sheet closes without applying, and clears them all', async () => {
    await setup();
    await fireEvent.press(screen.getByLabelText('Filtros'));
    await fireEvent.press(screen.getByLabelText('Espalda'));
    await fireEvent.press(screen.getByTestId('filter-sheet-scrim'));
    expect(screen.getAllByText(/^50 m libre$/)).toHaveLength(3);

    await filterBy('Espalda');
    expect(screen.queryByText(/^50 m libre$/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Filtros (1)'));
    await fireEvent.press(screen.getByText('Quitar filtros'));
    await fireEvent.press(screen.getByText('Aplicar filtros'));
    expect(screen.getAllByText(/^50 m libre$/)).toHaveLength(3);
    expect(screen.getByLabelText('Filtros')).toBeTruthy();
  });

  it('offers the filters even when every time is of the same event', async () => {
    await setup([lucia], [times[0]]);
    await fireEvent.press(screen.getByLabelText('Filtros'));
    expect(screen.getByText('Filtrar tiempos')).toBeTruthy();
    expect(screen.getByLabelText('Libre')).toBeTruthy();
  });
});
