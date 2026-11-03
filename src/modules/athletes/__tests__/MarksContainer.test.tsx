import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

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

const groupIds = () => screen.getAllByTestId(/^marks-group-/).map((node) => String(node.props.testID).replace('marks-group-', ''));

const measurements = [
  result('m1', 'a1', 3500, '2026-09-01T08:00:00Z'),
  result('m2', 'a1', 3482, '2026-10-18T08:00:00Z'),
  result('m3', 'a1', 3300, '2026-10-17T08:00:00Z', { pool: 'LCM' }),
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
    await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText(formatTime(profile!.hundredths))).toBeOnTheScreen());
    expect(screen.getByRole('header', { name: 'Marcas de Lucía' })).toBeOnTheScreen();
    expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('50 m')).toBeOnTheScreen();
    // The other events of the design have no time yet.
    expect(screen.getAllByText('Aún sin tiempo').length).toBe(6);
  });

  it('groups the marks by stroke, headers in catalog order and events by distance, with no empty section', async () => {
    await show();
    await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('34,82')).toBeOnTheScreen());

    expect(groupIds()).toEqual(['FR', 'BK', 'BR', 'FL', 'IM']);
    const events = screen.getAllByTestId(/^marks-card-/).map((node) => String(node.props.testID).replace('marks-card-', ''));
    expect(events).toEqual(['FR-50m', 'FR-100m', 'BK-50m', 'BK-100m', 'BR-50m', 'FL-50m', 'IM-100m']);
  });

  it('features the most recent mark of the pool and computes it again for the other pool', async () => {
    await show({ today: '2026-10-20' });
    await waitFor(() => expect(within(screen.getByTestId('marks-featured')).getByText('34,82')).toBeOnTheScreen());
    expect(within(screen.getByTestId('marks-featured')).getByLabelText('Nueva · 18 oct')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'Piscina 50 m' }));

    expect(within(screen.getByTestId('marks-featured')).getByText('33,00')).toBeOnTheScreen();
  });

  it('says the featured mark is not new once it is older than 14 days', async () => {
    await show({ today: '2026-11-02' });
    await waitFor(() => expect(screen.getByTestId('marks-featured')).toBeOnTheScreen());

    expect(within(screen.getByTestId('marks-featured')).queryByLabelText(/Nueva/)).toBeNull();
  });

  it('has no Combinado section in the long pool while IM 100 has no mark', async () => {
    await show();
    await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('34,82')).toBeOnTheScreen());

    await fireEvent.press(screen.getByRole('radio', { name: 'Piscina 50 m' }));

    expect(groupIds()).toEqual(['FR', 'BK', 'BR', 'FL']);
  });

  it('shows the marks of the other pool when it is chosen', async () => {
    await show();
    await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('34,82')).toBeOnTheScreen());

    await fireEvent.press(screen.getByRole('radio', { name: 'Piscina 50 m' }));

    expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('33,00')).toBeOnTheScreen();
    expect(within(screen.getByTestId('marks-card-FR-50m')).queryByText('34,82')).toBeNull();
  });

  it('keeps the screen, its chips and its title when the pool changes, with no loading in between', async () => {
    await show();
    await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('34,82')).toBeOnTheScreen());

    await fireEvent.press(screen.getByRole('radio', { name: 'Piscina 50 m' }));

    expect(screen.getByRole('header', { name: 'Marcas de Lucía' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /Tomás R\./ })).toBeOnTheScreen();
    expect(screen.queryByText('Cargando')).toBeNull();
  });

  it('opens the next athlete in the pool of their own latest result, not in the pool chosen for the previous one', async () => {
    await show();
    await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('34,82')).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole('radio', { name: 'Piscina 50 m' }));
    expect(screen.getByRole('radio', { name: 'Piscina 50 m' })).toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: /Tomás R\./ }));

    await waitFor(() => expect(screen.getByRole('header', { name: 'Marcas de Tomás' })).toBeOnTheScreen());
    expect(screen.getByRole('radio', { name: 'Piscina 25 m' })).toBeChecked();
    expect(screen.getAllByText('42,00')[0]).toBeOnTheScreen();
  });

  it('shows the marks of another athlete when the chip is pressed', async () => {
    await show();
    await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('34,82')).toBeOnTheScreen());

    await fireEvent.press(screen.getByRole('radio', { name: /Tomás R\./ }));

    await waitFor(() => expect(screen.getByRole('header', { name: 'Marcas de Tomás' })).toBeOnTheScreen());
    expect(screen.getAllByText('42,00')[0]).toBeOnTheScreen();
  });

  describe('imported official results', () => {
    const official = (id: string, hundredths: number | null, swumOn: string, over: Record<string, unknown> = {}) => ({
      id,
      provider: 'xx-demo',
      stroke: 'FR' as const,
      distance: '50m' as const,
      pool: 'LCM' as const,
      hundredths: hundredths as Hundredths | null,
      swumOn,
      ...over,
    });
    const importedRepo = (rows: ReturnType<typeof official>[]) => ({ listByAthlete: jest.fn(async (athleteId: string) => (athleteId === 'a1' ? rows : [])) });
    const sourceNames = { 'xx-demo': 'Federación Demo' };
    const noHistory = createInMemoryHistoryRepository([]);

    it('shows the marks of an athlete who only has imported results, opening in the pool of the data', async () => {
      await show({ history: noHistory, importedResults: importedRepo([official('i1', 3300, '2026-09-12')]), sourceNames });

      await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('33,00')).toBeOnTheScreen());
      expect(screen.getByRole('radio', { name: 'Piscina 50 m', selected: true })).toBeOnTheScreen();
    });

    it('shows the origin of each mark: the official one with the organization from the data, the measured one as it was', async () => {
      await show({
        history: createInMemoryHistoryRepository([result('m1', 'a1', 4108, '2026-10-02T08:00:00Z', { pool: 'LCM', stroke: 'BK' })]),
        importedResults: importedRepo([official('i1', 3300, '2026-09-12')]),
        sourceNames,
      });

      await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('33,00')).toBeOnTheScreen());
      expect(screen.getAllByLabelText(/Federación Demo · \d{4}/).length).toBeGreaterThan(0);
      expect(screen.getAllByLabelText(/Comp\. · /).length).toBeGreaterThan(0);
    });

    it('says only "Oficial" when the organization is not known', async () => {
      await show({ history: noHistory, importedResults: importedRepo([official('i1', 3300, '2026-09-12')]) });

      await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('33,00')).toBeOnTheScreen());
      expect(screen.getAllByLabelText(/Oficial · \d{4}/).length).toBeGreaterThan(0);
      expect(screen.queryAllByLabelText(/Federación/)).toHaveLength(0);
    });

    it('gives a tie between a measured and an imported time to the one achieved first, whatever the source', async () => {
      await show({
        history: createInMemoryHistoryRepository([result('m1', 'a1', 3300, '2026-10-01T08:00:00Z', { pool: 'LCM' })]),
        importedResults: importedRepo([official('i1', 3300, '2026-09-12')]),
        sourceNames,
      });

      await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('33,00')).toBeOnTheScreen());
      expect(screen.getAllByLabelText(/Federación Demo · \d{4}/).length).toBeGreaterThan(0);
      expect(screen.queryAllByLabelText(/Comp\. · /)).toHaveLength(0);
    });

    it('opens in the pool of the most recent result, imported or measured', async () => {
      const older = createInMemoryHistoryRepository([result('m1', 'a1', 3482, '2026-08-01T08:00:00Z')]);
      await show({ history: older, importedResults: importedRepo([official('i1', 3300, '2026-09-12')]), sourceNames });

      await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('33,00')).toBeOnTheScreen());
      expect(screen.getByRole('radio', { name: 'Piscina 50 m', selected: true })).toBeOnTheScreen();
    });

    it('opens in the short pool when the most recent result is a measured one in it', async () => {
      const newer = createInMemoryHistoryRepository([result('m1', 'a1', 3482, '2026-10-01T08:00:00Z')]);
      await show({ history: newer, importedResults: importedRepo([official('i1', 3300, '2026-09-12')]), sourceNames });

      await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('34,82')).toBeOnTheScreen());
      expect(screen.getByRole('radio', { name: 'Piscina 25 m', selected: true })).toBeOnTheScreen();
    });

    it('keeps the pool the person chose when the marks load again', async () => {
      await show({ history: noHistory, importedResults: importedRepo([official('i1', 3300, '2026-09-12')]), sourceNames });
      await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('33,00')).toBeOnTheScreen());

      await fireEvent.press(screen.getByRole('radio', { name: 'Piscina 25 m' }));

      expect(screen.getByRole('radio', { name: 'Piscina 25 m', selected: true })).toBeOnTheScreen();
      expect(screen.queryByText('33,00')).toBeNull();
    });

    it('offers a retry when the imported results cannot be read', async () => {
      await show({ importedResults: { listByAthlete: jest.fn().mockRejectedValue(new Error('db')) } });

      await waitFor(() => expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeOnTheScreen());
    });
  });

  it('opens in the short pool when the athlete has no results at all', async () => {
    await show({ history: createInMemoryHistoryRepository([]) });

    await waitFor(() => expect(screen.getAllByText('Aún sin tiempo').length).toBe(7));
    expect(screen.getByRole('radio', { name: 'Piscina 25 m', selected: true })).toBeOnTheScreen();
  });

  it('offers a retry, not "Aún sin tiempo", when the history cannot be read', async () => {
    const failing = { listByAthlete: jest.fn().mockRejectedValue(new Error('db')) };
    await show({ history: failing });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeOnTheScreen());
    expect(screen.queryByText('Aún sin tiempo')).toBeNull();
  });

  it('reads the history again when refreshKey changes, so a time that arrives by sync shows up', async () => {
    let stored: HistoryMeasurement[] = [];
    const synced = { listByAthlete: jest.fn(async () => stored) };
    const tree = (refreshKey: number) => (
      <ThemeProvider>
        <MarksContainer userId="guardian-1" managed={managed} athletes={athletes} history={synced} refreshKey={refreshKey} scrollEnabled={false} />
      </ThemeProvider>
    );
    const view = await render(tree(1));
    await waitFor(() => expect(screen.getAllByText('Aún sin tiempo').length).toBe(7));

    stored = [result('m9', 'a1', 3482, '2026-10-18T08:00:00Z')];
    await view.rerender(tree(2));

    await waitFor(() => expect(within(screen.getByTestId('marks-card-FR-50m')).getByText('34,82')).toBeOnTheScreen());
    expect(synced.listByAthlete).toHaveBeenCalledTimes(2);
  });

  it('says there are no athletes when the person manages none', async () => {
    await show({ userId: 'nobody' });

    await waitFor(() => expect(screen.getByText('Aún no hay deportistas')).toBeOnTheScreen());
  });
});
