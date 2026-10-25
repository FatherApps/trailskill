import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import { ThemeProvider } from '../../../core/theme';
import { AthleteProfileContainer, createInMemoryHistoryRepository, createInMemorySchoolAthleteRepository } from '..';
import type { HistoryMeasurement, HistoryRepository } from '..';

jest.mock('../../../core/sync', () => ({
  db: {},
  useRecordSyncStates: () => new Map(),
}));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const athletes = createInMemorySchoolAthleteRepository({
  athletes: [{ id: 'a1', firstName: 'Ana', lastName: 'Marin' }],
  athleteSchools: [],
  athleteGroups: [],
});
const authorizations = (granted: boolean) =>
  createInMemoryAuthorizationStatusRepository([{ athleteId: 'a1', purpose: 'record_times', isGranted: granted }]);

const measurement = (over: Partial<HistoryMeasurement> & { id: string }): HistoryMeasurement =>
  ({
    athleteId: 'a1',
    seriesId: null,
    arrivalPosition: null,
    kind: 'race',
    hundredths: 3482,
    stroke: 'FR',
    distance: '50m',
    pool: 'SCM',
    sessionType: 'competition',
    source: 'screen_stopwatch',
    createdBy: 'coach-1',
    deviceId: 'device-1',
    capturedAt: '2026-10-18T10:00:00.000Z',
    parentId: null,
    version: 1,
    editedBy: null,
    editedAt: null,
    editReason: null,
    origin: 'own',
    ...over,
  }) as HistoryMeasurement;

const show = (props: Partial<Parameters<typeof AthleteProfileContainer>[0]> = {}) =>
  render(
    <ThemeProvider>
      <AthleteProfileContainer
        athleteId="a1"
        athletes={athletes}
        history={createInMemoryHistoryRepository([measurement({ id: 'm1' })])}
        authorizations={authorizations(true)}
        lastSyncedAt={null}
        {...props}
      />
    </ThemeProvider>,
  );

describe('athlete profile container', () => {
  it('shows the name, the personal best and the history of the athlete', async () => {
    await show();

    expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
    expect(screen.getAllByText('34,82', { includeHiddenElements: true }).length).toBeGreaterThan(0);
  });

  it('shows the authorization as pending when the athlete has not granted recording times', async () => {
    await show({ authorizations: authorizations(false) });

    expect(await screen.findByLabelText('Autorización pendiente')).toBeOnTheScreen();
  });

  it('invites to the first time when the athlete has no results', async () => {
    await show({ history: createInMemoryHistoryRepository([]) });

    expect(await screen.findByText('Aún no hay tiempos')).toBeOnTheScreen();
  });

  it('says the information is private when the athlete is not on the device', async () => {
    await show({ athleteId: 'someone-else' });

    expect(await screen.findByText('Esta información es privada')).toBeOnTheScreen();
  });

  it('shows the error with a retry when the history cannot be read', async () => {
    const history: HistoryRepository = {
      listByEvent: jest.fn().mockRejectedValueOnce(new Error('db')).mockResolvedValue([measurement({ id: 'm1' })]),
      listByAthlete: jest.fn(),
    };
    await show({ history });

    await fireEvent.press(await screen.findByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
  });

  it('does not count a time that is not a race or a repetition as the personal best', async () => {
    await show({ history: createInMemoryHistoryRepository([measurement({ id: 'm1', kind: 'series_total', hundredths: 1000 })]) });

    expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
    // Only the history row shows it: the personal best card has no time.
    expect(screen.getAllByText('10,00', { includeHiddenElements: true })).toHaveLength(1);
  });
});
