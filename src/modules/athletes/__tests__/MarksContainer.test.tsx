import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { formatTime, type Hundredths } from '../../../core/time';
import { createInMemoryManagedAthleteRepository } from '../../accounts';
import { ThemeProvider } from '../../../core/theme';
import {
  createInMemoryHistoryRepository,
  createInMemorySchoolAthleteRepository,
  MarksContainer,
  personalBest,
  type HistoryMeasurement,
} from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const athletes = createInMemorySchoolAthleteRepository({
  athletes: [
    { id: 'a1', firstName: 'Lucía', lastName: 'Ramírez' },
    { id: 'a2', firstName: 'Tomás', lastName: 'Rojas' },
  ],
  athleteSchools: [],
  athleteGroups: [],
});
const managed = createInMemoryManagedAthleteRepository([
  { userId: 'guardian-1', athleteId: 'a1', relation: 'guardian' },
  { userId: 'guardian-1', athleteId: 'a2', relation: 'guardian' },
]);

function result(id: string, athleteId: string, hundredths: number, capturedAt: string, over: Partial<HistoryMeasurement> = {}): HistoryMeasurement {
  return {
    id,
    kind: 'race',
    athleteId,
    seriesId: null,
    arrivalPosition: null,
    hundredths: hundredths as Hundredths,
    stroke: 'FR',
    distance: '50m',
    pool: 'SCM',
    sessionType: 'competition',
    source: 'screen_button',
    createdBy: 'coach-a',
    deviceId: 'device-a',
    capturedAt,
    parentId: null,
    origin: 'own',
    ...over,
  } as HistoryMeasurement;
}

const measurements = [
  result('m1', 'a1', 3500, '2026-09-01T08:00:00Z'),
  result('m2', 'a1', 3482, '2026-10-18T08:00:00Z'),
  result('m3', 'a1', 3300, '2026-10-19T08:00:00Z', { pool: 'LCM' }),
  result('m4', 'a2', 4200, '2026-10-02T08:00:00Z'),
];
const history = createInMemoryHistoryRepository(measurements);

const show = (props: Partial<Parameters<typeof MarksContainer>[0]> = {}) =>
  render(
    <ThemeProvider>
      <MarksContainer userId="guardian-1" managed={managed} athletes={athletes} history={history} scrollEnabled={false} {...props} />
    </ThemeProvider>,
  );

describe('MarksContainer', () => {
  it('shows the mark of the first athlete, equal to the one the profile computes for the same event', async () => {
    await show();

    const profile = personalBest(await history.listByEvent('a1', { stroke: 'FR', distance: '50m', pool: 'SCM' }));
    await waitFor(() => expect(screen.getByText(formatTime(profile!.hundredths))).toBeOnTheScreen());
    expect(screen.getByRole('header', { name: 'Marcas de Lucía' })).toBeOnTheScreen();
    // The other events of the design have no time yet.
    expect(screen.getAllByText('Aún sin tiempo').length).toBe(6);
  });

  it('shows the marks of the other pool when it is chosen', async () => {
    await show();
    await waitFor(() => expect(screen.getByText('34,82')).toBeOnTheScreen());

    await fireEvent.press(screen.getByRole('radio', { name: 'Piscina 50 m' }));

    expect(screen.getByText('33,00')).toBeOnTheScreen();
    expect(screen.queryByText('34,82')).toBeNull();
  });

  it('shows the marks of another athlete when the chip is pressed', async () => {
    await show();
    await waitFor(() => expect(screen.getByText('34,82')).toBeOnTheScreen());

    await fireEvent.press(screen.getByRole('radio', { name: /Tomás R\./ }));

    await waitFor(() => expect(screen.getByRole('header', { name: 'Marcas de Tomás' })).toBeOnTheScreen());
    expect(screen.getByText('42,00')).toBeOnTheScreen();
  });

  it('offers a retry, not "Aún sin tiempo", when the history cannot be read', async () => {
    const failing = { listByAthlete: jest.fn().mockRejectedValue(new Error('db')) };
    await show({ history: failing });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeOnTheScreen());
    expect(screen.queryByText('Aún sin tiempo')).toBeNull();
  });

  it('says there are no athletes when the person manages none', async () => {
    await show({ userId: 'nobody' });

    await waitFor(() => expect(screen.getByText('Aún no hay deportistas')).toBeOnTheScreen());
  });
});
