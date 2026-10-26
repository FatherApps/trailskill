import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import { ThemeProvider } from '../../../core/theme';
import { spokenTime } from '../../../core/time';
import { createInMemorySchoolNameRepository, createInMemorySchoolStructureRepository } from '../../school-console';
import {
  AthleteProfileContainer,
  createInMemoryAthleteSchoolRepository,
  createInMemoryHistoryRepository,
  createInMemoryOtherSchoolResultsRepository,
  createInMemorySchoolAthleteRepository,
} from '..';
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
const schoolLinks = createInMemoryAthleteSchoolRepository([
  { athleteId: 'a1', schoolId: 'delfines', categoryId: 'infantil' },
  { athleteId: 'a1', schoolId: 'tiburones', categoryId: 'juvenil' },
]);
const schoolNames = createInMemorySchoolNameRepository([
  { id: 'delfines', name: 'Escuela Delfines' },
  { id: 'tiburones', name: 'Club Tiburones' },
]);
const categories = createInMemorySchoolStructureRepository({
  categories: [
    { id: 'infantil', schoolId: 'delfines', name: 'Infantil B', sortOrder: 0 },
    { id: 'juvenil', schoolId: 'tiburones', name: 'Juvenil A', sortOrder: 0 },
  ],
  groups: [],
  groupAssignments: [],
  athleteAssignments: [],
  coachMemberships: [],
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
        schoolLinks={schoolLinks}
        schoolNames={schoolNames}
        categories={categories}
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

  it('does not reload the profile when the connection flaps for a viewer without other-school results', async () => {
    const history = createInMemoryHistoryRepository([measurement({ id: 'm1' })]);
    const listByEvent = jest.spyOn(history, 'listByEvent');
    const granted = authorizations(true);
    const tree = (online: boolean) => (
      <ThemeProvider>
        <AthleteProfileContainer
          athleteId="a1"
          athletes={athletes}
          history={history}
          authorizations={granted}
          schoolLinks={schoolLinks}
          schoolNames={schoolNames}
          categories={categories}
          lastSyncedAt={null}
          online={online}
        />
      </ThemeProvider>
    );
    const view = await render(tree(true));
    expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();

    await view.rerender(tree(false));

    expect(screen.getByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
    expect(listByEvent).toHaveBeenCalledTimes(1);
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
      listByAthletesEvent: jest.fn(),
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

  it('shows the category and the school, and no school selector with a single school', async () => {
    await show({ schoolLinks: createInMemoryAthleteSchoolRepository([{ athleteId: 'a1', schoolId: 'delfines', categoryId: 'infantil' }]) });

    expect(await screen.findByText('Infantil B · Escuela Delfines')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Escuela')).toBeNull();
  });

  it('chooses among several schools and shows the category and the school of the chosen one', async () => {
    await show();

    expect(await screen.findByText('Juvenil A · Club Tiburones')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Escuela Delfines' }));

    expect(await screen.findByText('Infantil B · Escuela Delfines')).toBeOnTheScreen();
  });

  it('shows the profile without category or school when the athlete has none on the device', async () => {
    await show({ schoolLinks: createInMemoryAthleteSchoolRepository([]) });

    expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Escuela')).toBeNull();
  });

  describe('results of another school', () => {
    const otherSchool = () =>
      createInMemoryOtherSchoolResultsRepository([
        {
          athleteId: 'a1',
          id: 'o1',
          kind: 'race',
          hundredths: 3300,
          stroke: 'FR',
          distance: '50m',
          pool: 'SCM',
          sessionType: 'competition',
          capturedAt: '2026-10-19T10:00:00.000Z',
          arrivalPosition: null,
        },
      ]);
    const tree = (props: Partial<Parameters<typeof AthleteProfileContainer>[0]>) => (
      <ThemeProvider>
        <AthleteProfileContainer
          athleteId="a1"
          athletes={athletes}
          history={createInMemoryHistoryRepository([measurement({ id: 'm1' })])}
          authorizations={authorizations(true)}
          schoolLinks={schoolLinks}
          schoolNames={schoolNames}
          categories={categories}
          lastSyncedAt={null}
          {...props}
        />
      </ThemeProvider>
    );

    it('shows them as online only while connected, and drops them without keeping a copy when the connection is lost', async () => {
      const results = otherSchool();
      const listByEvent = jest.spyOn(results, 'listByEvent');
      const view = await render(tree({ otherSchoolResults: results, online: true }));

      expect(await screen.findByLabelText(/Otra escuela.*Solo en línea/)).toBeOnTheScreen();
      expect(screen.getAllByText('33,00', { includeHiddenElements: true }).length).toBeGreaterThan(0);

      await view.rerender(tree({ otherSchoolResults: results, online: false }));

      expect(await screen.findByText('Disponible con conexión')).toBeOnTheScreen();
      expect(screen.queryByLabelText(/Otra escuela/)).toBeNull();
      expect(screen.queryAllByText('33,00', { includeHiddenElements: true })).toHaveLength(0);
      expect(listByEvent).toHaveBeenCalledTimes(1);
    });

    it('keeps the profile and offers a retry, not the offline notice, when only the other school fails while connected', async () => {
      const results = { listByEvent: jest.fn().mockRejectedValueOnce(new Error('server')).mockResolvedValue([]) };
      const history = createInMemoryHistoryRepository([measurement({ id: 'm1' })]);
      const localReads = jest.spyOn(history, 'listByEvent');
      await show({ otherSchoolResults: results, history, online: true });

      expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
      expect(await screen.findByText('No pudimos cargar los resultados de otra escuela')).toBeOnTheScreen();
      expect(screen.queryByText('Disponible con conexión')).toBeNull();
      expect(screen.getAllByText('34,82', { includeHiddenElements: true }).length).toBeGreaterThan(0);

      await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

      await waitFor(() => expect(screen.queryByText('No pudimos cargar los resultados de otra escuela')).toBeNull());
      expect(results.listByEvent).toHaveBeenCalledTimes(2);
      expect(localReads).toHaveBeenCalledTimes(1);
    });

    it('does not reload the athlete, the authorizations, the local history or the schools when the connection flaps', async () => {
      const results = otherSchool();
      const history = createInMemoryHistoryRepository([measurement({ id: 'm1' })]);
      const granted = authorizations(true);
      const reads = [
        jest.spyOn(athletes, 'listByIds'),
        jest.spyOn(history, 'listByEvent'),
        jest.spyOn(schoolLinks, 'listByAthlete'),
        jest.spyOn(schoolNames, 'listByIds'),
        jest.spyOn(granted, 'listGrantedAthleteIds'),
      ];
      const props = { otherSchoolResults: results, history, authorizations: granted };
      const view = await render(tree({ ...props, online: true }));
      expect(await screen.findByLabelText(/Otra escuela.*Solo en línea/)).toBeOnTheScreen();
      const before = reads.map((read) => read.mock.calls.length);

      await view.rerender(tree({ ...props, online: false }));
      expect(await screen.findByText('Disponible con conexión')).toBeOnTheScreen();
      await view.rerender(tree({ ...props, online: true }));
      expect(await screen.findByLabelText(/Otra escuela.*Solo en línea/)).toBeOnTheScreen();

      expect(reads.map((read) => read.mock.calls.length)).toEqual(before);
    });

    it('does not reload the local profile when the other-school repository arrives after the first load', async () => {
      const history = createInMemoryHistoryRepository([measurement({ id: 'm1' })]);
      const localReads = jest.spyOn(history, 'listByEvent');
      const props = { history, authorizations: authorizations(true), online: true };
      const view = await render(tree(props));
      expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();

      await view.rerender(tree({ ...props, otherSchoolResults: otherSchool() }));

      expect(await screen.findByLabelText(/Otra escuela.*Solo en línea/)).toBeOnTheScreen();
      expect(localReads).toHaveBeenCalledTimes(1);
    });

    it('orders ties on the capture time by id, newest id first, across local and other-school rows', async () => {
      const at = '2026-10-19T10:00:00.000Z';
      const other = { kind: 'race', stroke: 'FR', distance: '50m', pool: 'SCM', sessionType: 'competition', arrivalPosition: null } as const;
      const results = createInMemoryOtherSchoolResultsRepository([
        { ...other, athleteId: 'a1', id: 'z9', hundredths: 3300, capturedAt: at },
        { ...other, athleteId: 'a1', id: 'c3', hundredths: 3600, capturedAt: '2026-10-01T10:00:00.000Z' },
      ]);
      const history = createInMemoryHistoryRepository([
        measurement({ id: 'a1', hundredths: 3400, capturedAt: at }),
        measurement({ id: 'm5', hundredths: 3500, capturedAt: at }),
      ]);
      await show({ otherSchoolResults: results, history, online: true });
      await screen.findAllByLabelText(/Otra escuela/);

      const rows = screen.getAllByLabelText(/^Libre 50 m/);

      expect(rows).toHaveLength(4);
      // z9 (other school), m5 and a1 share the instant: id descending. c3 is older.
      [3300, 3500, 3400, 3600].forEach((time, i) =>
        expect(rows[i]).toHaveProp('accessibilityLabel', expect.stringContaining(spokenTime(time))),
      );
    });

    it('shows a measurement the viewer already has on the device once, with its own sync state, not as another school', async () => {
      const results = createInMemoryOtherSchoolResultsRepository([
        {
          athleteId: 'a1',
          id: 'm1',
          kind: 'race',
          hundredths: 3482,
          stroke: 'FR',
          distance: '50m',
          pool: 'SCM',
          sessionType: 'competition',
          capturedAt: '2026-10-18T10:00:00.000Z',
          arrivalPosition: null,
        },
      ]);
      const listByEvent = jest.spyOn(results, 'listByEvent');
      await show({ otherSchoolResults: results, online: true });
      await waitFor(() => expect(listByEvent).toHaveBeenCalled());

      const rows = await screen.findAllByLabelText(/^Libre 50 m/);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveProp('accessibilityLabel', expect.not.stringContaining('Otra escuela'));
    });

    describe('when the other school does not answer', () => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());

      it('shows the rest of the profile at once and moves the section to the error with a retry after the timeout', async () => {
        const results = { listByEvent: jest.fn().mockReturnValue(new Promise(() => {})) };
        await show({ otherSchoolResults: results, online: true });

        expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
        expect(screen.queryByText('No pudimos cargar los resultados de otra escuela')).toBeNull();

        await act(async () => {
          await jest.advanceTimersByTimeAsync(10_000);
        });

        expect(await screen.findByText('No pudimos cargar los resultados de otra escuela')).toBeOnTheScreen();
        expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeOnTheScreen();
      });
    });
  });
});
