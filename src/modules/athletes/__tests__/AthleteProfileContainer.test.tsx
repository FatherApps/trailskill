import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import { StyleSheet, Text } from 'react-native';

import { colors, ThemeProvider } from '../../../core/theme';
import { spokenTime } from '../../../core/time';
import { createInMemorySchoolNameRepository, createInMemorySchoolStructureRepository } from '../../school-console';
import {
  AthleteProfileContainer,
  athleteDisplay,
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
const athlete = { id: 'a1', firstName: 'Ana', lastName: 'Marin' };
const athletes = createInMemorySchoolAthleteRepository({
  athletes: [athlete],
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

const noop = () => {};

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
        onBack={noop}
        {...props}
      />
    </ThemeProvider>,
  );

describe('athlete profile container', () => {
  it('offers the official import only when the route passes the prompt', async () => {
    const onStart = jest.fn();
    await show({ importPrompt: { sourceName: 'FEDNAT', athleteName: 'Ana', imported: false, onDismiss: noop, onRefresh: noop, onStart } });

    fireEvent.press(await screen.findByRole('button', { name: 'Buscar en FEDNAT' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('shows no import prompt when the route passes none', async () => {
    await show();

    expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Buscar en/ })).toBeNull();
  });

  it('shows the name, the personal best and the history of the athlete', async () => {
    await show();

    expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
    expect(screen.getAllByText('34,82', { includeHiddenElements: true }).length).toBeGreaterThan(0);
  });

  it('does not reload the profile when the connection flaps for a viewer without other-school results', async () => {
    const history = createInMemoryHistoryRepository([measurement({ id: 'm1' })]);
    const listByAthlete = jest.spyOn(history, 'listByAthlete');
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
          onBack={noop}
          online={online}
        />
      </ThemeProvider>
    );
    const view = await render(tree(true));
    expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();

    await view.rerender(tree(false));

    expect(screen.getByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
    expect(listByAthlete).toHaveBeenCalledTimes(1);
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

  it('gives the states without the athlete the same back action', async () => {
    const onBack = jest.fn();
    await show({ athleteId: 'someone-else', onBack });

    await fireEvent.press(await screen.findByRole('button', { name: 'Volver' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows the error with a retry when the history cannot be read', async () => {
    const history: HistoryRepository = {
      listByEvent: jest.fn(),
      listByAthlete: jest.fn().mockRejectedValueOnce(new Error('db')).mockResolvedValue([measurement({ id: 'm1' })]),
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

  describe('header on the first frame (issue 849)', () => {
    // A device read that never answers keeps the container in its loading state.
    const never = { ...athletes, listByIds: () => new Promise<never>(() => {}) };
    const bandOf = (button: ReturnType<typeof screen.getByRole>) => {
      let node = button.parent;
      while (node && StyleSheet.flatten(node.props.style)?.backgroundColor === undefined) node = node.parent;
      return StyleSheet.flatten(node!.props.style).backgroundColor;
    };

    it("shows the athlete's name and colour while the rest still loads, with no step through sky", async () => {
      await show({ athletes: never, athlete });

      expect(screen.getByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
      expect(bandOf(screen.getByRole('button', { name: 'Volver' }))).toBe(colors.light[athleteDisplay(athlete).color]);
      expect(screen.getByTestId('state-view')).toBeOnTheScreen();
    });

    it('keeps the neutral sky band when the athlete is not on the device yet', async () => {
      await show({ athletes: never });

      expect(screen.queryByRole('header')).toBeNull();
      expect(bandOf(screen.getByRole('button', { name: 'Volver' }))).toBe(colors.light.sky);
    });

    it('ignores a preview that belongs to another athlete', async () => {
      await show({ athletes: never, athlete: { ...athlete, id: 'other' } });

      expect(screen.queryByRole('header')).toBeNull();
      expect(bandOf(screen.getByRole('button', { name: 'Volver' }))).toBe(colors.light.sky);
    });
  });

  it("paints the band with the athlete's colour from their id and goes back through onBack", async () => {
    const onBack = jest.fn();
    await show({ onBack });

    const title = await screen.findByRole('header', { name: 'Ana Marin' });
    expect(StyleSheet.flatten(title.parent!.props.style).backgroundColor).toBe(colors.light[athleteDisplay(athlete).color]);
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(onBack).toHaveBeenCalledTimes(1);
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
          onBack={noop}
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
      const localReads = jest.spyOn(history, 'listByAthlete');
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
        jest.spyOn(history, 'listByAthlete'),
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
      const localReads = jest.spyOn(history, 'listByAthlete');
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

      const rows = screen.getAllByLabelText(/^Libre 50 m, /);

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

      const rows = await screen.findAllByLabelText(/^Libre 50 m, /);

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
  describe('imported official results', () => {
    const imported = (over: Record<string, unknown> = {}) => ({
      id: 'i1',
      provider: 'xx-demo',
      stroke: 'FR',
      distance: '50m',
      pool: 'SCM',
      hundredths: 2910,
      swumOn: '2026-09-05',
      ...over,
    });
    const repo = (rows: ReturnType<typeof imported>[]) => ({ listByAthlete: jest.fn().mockResolvedValue(rows) });

    it('shows no "Solo en línea" on an imported row: it is on the device with nothing pending (issue 849)', async () => {
      await show({ importedResults: repo([imported()]) });

      const row = await screen.findByLabelText(/Importado/);
      expect(row.props.accessibilityLabel).not.toMatch(/Solo en línea/);
      expect(screen.queryAllByText('Solo en línea', { includeHiddenElements: true })).toHaveLength(0);
    });

    it('lists them in the history of the chosen event, labelled with their origin', async () => {
      await show({ importedResults: repo([imported(), imported({ id: 'i2', stroke: 'BK', hundredths: 3333 })]) });

      expect(await screen.findByLabelText(/Importado/)).toBeOnTheScreen();
      expect(screen.getAllByText('29,10', { includeHiddenElements: true }).length).toBeGreaterThan(0);
      expect(screen.queryAllByText('33,33', { includeHiddenElements: true })).toHaveLength(0);
    });

    it('shows a missing time as a dash, never zero', async () => {
      await show({ importedResults: repo([imported({ hundredths: null })]) });

      await screen.findByLabelText(/Importado/);
      expect(screen.queryAllByText(/0[,.]00/, { includeHiddenElements: true })).toHaveLength(0);
    });

    // #204: an imported result counts as a race and is compared together with the measured times.
    it('counts an imported time as a race in the personal best, together with the measured ones', async () => {
      await show({ importedResults: repo([imported({ hundredths: 2000 })]) });

      await screen.findByLabelText(/Importado/);
      expect(screen.getByLabelText(new RegExp(`^Marca personal.*${spokenTime(2000)}`))).toBeOnTheScreen();
      // The measured time stays in the history.
      expect(screen.getAllByText('34,82', { includeHiddenElements: true }).length).toBeGreaterThan(0);
    });

    it('draws them in the progress chart with the rest of the event, as a competition result', async () => {
      await show({ importedResults: repo([imported({ hundredths: 2910 })]) });

      await screen.findByLabelText(/Importado/);
      const chart = screen.getByRole('image', { name: /^Progreso en Libre 50 m/ });
      expect(chart).toBeOnTheScreen();
      expect(screen.getByTestId('chart-marker-i1', { includeHiddenElements: true })).toBeOnTheScreen();
    });

    it('keeps a faster measured time as the personal best over a slower imported one', async () => {
      await show({ importedResults: repo([imported({ hundredths: 4000 })]) });

      await screen.findByLabelText(/Importado/);
      expect(screen.getByLabelText(new RegExp(`^Marca personal.*${spokenTime(3482)}`))).toBeOnTheScreen();
    });

    it('names the organization of an imported result from the data', async () => {
      await show({ importedResults: repo([imported({ provider: 'xx-demo' })]), sourceNames: { 'xx-demo': 'Federación Demo' } });

      expect(await screen.findByLabelText(/Federación Demo/)).toBeOnTheScreen();
    });

    it('opens in the event of the most recent result, imported or measured', async () => {
      await show({ importedResults: repo([imported({ id: 'i9', stroke: 'BK', distance: '25m', pool: 'LCM', hundredths: 2500, swumOn: '2026-10-20' })]) });

      expect(await screen.findByLabelText(/Importado/)).toBeOnTheScreen();
      expect(screen.getAllByText('25,00', { includeHiddenElements: true }).length).toBeGreaterThan(0);
      expect(screen.queryAllByText('34,82', { includeHiddenElements: true })).toHaveLength(0);
    });

    it('opens in the event of the most recent measured result when there is no imported one', async () => {
      await show({
        history: createInMemoryHistoryRepository([measurement({ id: 'm1' }), measurement({ id: 'm2', stroke: 'BR', distance: '25m', pool: 'LCM', hundredths: 2800, capturedAt: '2026-10-25T10:00:00.000Z' })]),
      });

      await screen.findByRole('header', { name: 'Ana Marin' });
      expect(screen.getAllByText('28,00', { includeHiddenElements: true }).length).toBeGreaterThan(0);
      expect(screen.queryAllByText('34,82', { includeHiddenElements: true })).toHaveLength(0);
    });

    it('does not move the event the person chose when the data loads again', async () => {
      // The event to move to must have results: only those are on offer.
      const history = createInMemoryHistoryRepository([measurement({ id: 'm1' }), measurement({ id: 'm9', stroke: 'BK', hundredths: 4100, capturedAt: '2026-09-01T10:00:00.000Z' })]);
      await show({ history, importedResults: repo([imported({ hundredths: 2000 })]) });
      await screen.findByLabelText(/Importado/);

      fireEvent.press(screen.getByRole('radio', { name: 'Espalda 50 m' }));

      await waitFor(() => expect(screen.queryAllByText('34,82', { includeHiddenElements: true })).toHaveLength(0));
      expect(screen.getByRole('radio', { name: 'Espalda 50 m' })).toBeChecked();
    });

    it('shows the profile without them when the repository is not given', async () => {
      await show();
      await screen.findByRole('header', { name: 'Ana Marin' });
      expect(screen.queryByLabelText(/Importado/)).toBeNull();
    });
  });

  it('renders the official update content it is given', async () => {
    await show({ officialUpdate: <Text>Actualizar resultados oficiales</Text> });

    expect(await screen.findByText('Actualizar resultados oficiales')).toBeOnTheScreen();
  });

  describe('event chips and reactivity (issue 838)', () => {
    const hidden = { includeHiddenElements: true };
    const imported = (over: Record<string, unknown> = {}) => ({
      id: 'i1',
      provider: 'xx-demo',
      stroke: 'FR',
      distance: '50m',
      pool: 'SCM',
      hundredths: 3600,
      swumOn: '2026-08-01',
      ...over,
    });
    const races = [
      measurement({ id: 'm1', hundredths: 3710, capturedAt: '2026-04-18T10:00:00.000Z' }),
      measurement({ id: 'm2', hundredths: 3482, capturedAt: '2026-10-18T10:00:00.000Z' }),
      measurement({ id: 'm3', stroke: 'BK', hundredths: 4100, kind: 'repetition', sessionType: 'training', capturedAt: '2026-10-02T10:00:00.000Z' }),
      measurement({ id: 'm4', stroke: 'BR', distance: '100m', pool: 'LCM', hundredths: 11000, capturedAt: '2026-09-01T10:00:00.000Z' }),
    ];
    // A history whose per-event read never answers: the profile must not wait for it when the event changes.
    const stalledByEvent = () => {
      const stalled = createInMemoryHistoryRepository(races);
      // The first per-event read answers (a profile that reads per event needs it to open); every later one never does.
      const first = stalled.listByEvent.bind(stalled);
      jest.spyOn(stalled, 'listByEvent').mockImplementationOnce(first).mockImplementation(() => new Promise(() => {}));
      return stalled;
    };
    const withRaces = (over: Partial<Parameters<typeof AthleteProfileContainer>[0]> = {}) =>
      show({ history: createInMemoryHistoryRepository(races), ...over });

    it('offers only the events with results in the pool, not every stroke and distance', async () => {
      await withRaces();

      expect(await screen.findByRole('radio', { name: 'Libre 50 m' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Espalda 50 m' })).not.toBeChecked();
      expect(screen.queryByRole('radio', { name: 'Libre 100 m' })).toBeNull();
      expect(screen.queryByRole('radio', { name: 'Mariposa 50 m' })).toBeNull();
      expect(screen.queryByRole('radio', { name: 'Pecho 100 m' })).toBeNull();
    });

    it('offers a pool control only for the pools that have results, as a secondary row', async () => {
      await withRaces();

      expect(await screen.findByLabelText('Piscina')).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Piscina de 25 m' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Piscina de 50 m' })).not.toBeChecked();
    });

    it('has no pool control when only one pool has results', async () => {
      await show();

      expect(await screen.findByRole('radio', { name: 'Libre 50 m' })).toBeOnTheScreen();
      expect(screen.queryByLabelText('Piscina')).toBeNull();
    });

    it('has no event chips without results', async () => {
      await show({ history: createInMemoryHistoryRepository([]) });

      expect(await screen.findByText('Aún no hay tiempos')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Prueba')).toBeNull();
      expect(screen.queryByLabelText('Piscina')).toBeNull();
    });

    it('counts imported results when it offers the events', async () => {
      await show({
        history: createInMemoryHistoryRepository([]),
        importedResults: { listByAthlete: jest.fn().mockResolvedValue([imported({ stroke: 'FL', distance: '100m' })]) },
      });

      expect(await screen.findByRole('radio', { name: 'Mariposa 100 m' })).toBeChecked();
    });

    it('keeps the header, the chips and the structure when the event changes, and shows the new event', async () => {
      await withRaces({ history: stalledByEvent() });
      expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('radio', { name: 'Espalda 50 m' }));

      expect(screen.getByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Espalda 50 m' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Libre 50 m' })).toBeOnTheScreen();
      expect(screen.getByText('Marca personal · Espalda 50 m (piscina de 25 m)', hidden)).toBeOnTheScreen();
      expect(screen.getAllByText('41,00', hidden).length).toBeGreaterThan(0);
      expect(screen.queryByText('Cargando')).toBeNull();
    });

    it('keeps the header and the chips when the pool changes, and offers the events of the new pool', async () => {
      await withRaces({ history: stalledByEvent() });
      expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('radio', { name: 'Piscina de 50 m' }));

      expect(screen.getByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Piscina de 50 m' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Pecho 100 m' })).toBeChecked();
      expect(screen.queryByRole('radio', { name: 'Libre 50 m' })).toBeNull();
    });

    it('keeps the profile on screen while another school\'s results of the new event are still on their way', async () => {
      const pending: ((rows: never[]) => void)[] = [];
      const otherSchoolResults = { listByEvent: jest.fn(() => new Promise<never[]>((resolve) => pending.push(resolve))) };
      await withRaces({ otherSchoolResults, online: true });
      expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('radio', { name: 'Espalda 50 m' }));

      expect(screen.getByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Espalda 50 m' })).toBeChecked();
      expect(screen.getAllByText('41,00', hidden).length).toBeGreaterThan(0);
    });

    it('shows the origin of each row: competition, training and the imported organization from the data', async () => {
      await withRaces({
        importedResults: { listByAthlete: jest.fn().mockResolvedValue([imported()]) },
        sourceNames: { 'xx-demo': 'Federación Demo' },
      });

      expect(await screen.findByLabelText(/Libre 50 m, 18 de octubre de 2026, Competencia/)).toBeOnTheScreen();
      expect(screen.getByLabelText(/Libre 50 m, 1 de agosto de 2026, Competencia, Federación Demo/)).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('radio', { name: 'Espalda 50 m' }));
      expect(screen.getByLabelText(/Espalda 50 m, 2 de octubre de 2026, Entrenamiento/)).toBeOnTheScreen();
    });

    it('gives each row its own icon: competition, training and import', async () => {
      await withRaces({ importedResults: { listByAthlete: jest.fn().mockResolvedValue([imported()]) } });
      await screen.findByRole('radio', { name: 'Libre 50 m' });

      expect(screen.getAllByTestId('history-dot', hidden)).toHaveLength(3);
    });

    it('shows the total of measurements, equal to the rows of the history', async () => {
      await withRaces({ importedResults: { listByAthlete: jest.fn().mockResolvedValue([imported()]) } });

      expect(await screen.findByText('3 mediciones')).toBeOnTheScreen();
      expect(screen.getAllByTestId('history-head', hidden)).toHaveLength(3);
    });

    it('says one measurement in the singular', async () => {
      await show();

      expect(await screen.findByText('1 medición')).toBeOnTheScreen();
    });

    it('shows the improvement over the previous best on the personal best card', async () => {
      await withRaces();

      expect(await screen.findByText('−2,28 en 6 meses', hidden)).toBeOnTheScreen();
    });

    it('compares measured and imported results together for the improvement', async () => {
      await show({
        history: createInMemoryHistoryRepository([measurement({ id: 'm2', hundredths: 3482, capturedAt: '2026-10-18T10:00:00.000Z' })]),
        importedResults: { listByAthlete: jest.fn().mockResolvedValue([imported({ hundredths: 3710, swumOn: '2026-04-18' })]) },
      });

      expect(await screen.findByText('−2,28 en 6 meses', hidden)).toBeOnTheScreen();
    });

    it('shows no improvement without a previous best, never zero', async () => {
      await show();

      expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
      expect(screen.queryByText(/en \d+ mes/, hidden)).toBeNull();
      expect(screen.queryByText(/−0,00/, hidden)).toBeNull();
    });

    it('reads the history of the athlete once on opening, not twice in a row', async () => {
      const history = createInMemoryHistoryRepository(races);
      const byAthlete = jest.spyOn(history, 'listByAthlete');
      const byEvent = jest.spyOn(history, 'listByEvent');
      await show({ history });
      expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('radio', { name: 'Espalda 50 m' }));

      expect(byAthlete).toHaveBeenCalledTimes(1);
      expect(byEvent).not.toHaveBeenCalled();
    });

    describe('data that arrives while the profile is open', () => {
      // One instance: a new one on every render would itself ask for a new read.
      const granted = authorizations(true);
      const tree = (props: Partial<Parameters<typeof AthleteProfileContainer>[0]>) => (
        <ThemeProvider>
          <AthleteProfileContainer
            athleteId="a1"
            athletes={athletes}
            history={createInMemoryHistoryRepository(races)}
            authorizations={granted}
            schoolLinks={schoolLinks}
            schoolNames={schoolNames}
            categories={categories}
            lastSyncedAt={new Date('2026-10-20T10:00:00.000Z')}
            onBack={noop}
            {...props}
          />
        </ThemeProvider>
      );
      const newer = new Date('2026-10-21T10:00:00.000Z');

      it('reads again in silence when the last sync changes: the new result shows, with no loading and the chosen event kept', async () => {
        const rows: ReturnType<typeof imported>[] = [];
        const importedResults = { listByAthlete: jest.fn().mockImplementation(async () => rows) };
        const view = await render(tree({ importedResults }));
        await fireEvent.press(await screen.findByRole('radio', { name: 'Espalda 50 m' }));
        expect(screen.queryByLabelText(/Importado/)).toBeNull();

        // An import finished while the profile stayed mounted underneath the import screen.
        rows.push(imported({ id: 'i9', stroke: 'BK', hundredths: 3900, swumOn: '2026-10-20' }));
        await view.rerender(tree({ importedResults, lastSyncedAt: newer }));

        expect(screen.getByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
        expect(screen.queryByText('Cargando')).toBeNull();
        expect(await screen.findByLabelText(/Espalda 50 m, 20 de octubre de 2026, Competencia/)).toBeOnTheScreen();
        expect(screen.getByRole('radio', { name: 'Espalda 50 m' })).toBeChecked();
        expect(importedResults.listByAthlete).toHaveBeenCalledTimes(2);
      });

      it('shows a new measurement and a new event that arrive with the sync', async () => {
        let current = races;
        const history: HistoryRepository = {
          listByEvent: jest.fn(),
          listByAthlete: jest.fn(async () => current),
          listByAthletesEvent: jest.fn(),
        };
        const view = await render(tree({ history }));
        expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
        expect(screen.queryByRole('radio', { name: 'Mariposa 50 m' })).toBeNull();

        current = [...races, measurement({ id: 'm10', stroke: 'FL', hundredths: 3300, capturedAt: '2026-10-20T10:00:00.000Z' })];
        await view.rerender(tree({ history, lastSyncedAt: newer }));

        expect(await screen.findByRole('radio', { name: 'Mariposa 50 m' })).toBeOnTheScreen();
        expect(screen.getByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
      });

      it('keeps what it shows when the silent read fails, instead of replacing it with the error', async () => {
        const history: HistoryRepository = {
          listByEvent: jest.fn(),
          listByAthlete: jest.fn().mockResolvedValueOnce(races).mockRejectedValue(new Error('db')),
          listByAthletesEvent: jest.fn(),
        };
        const view = await render(tree({ history }));
        expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();

        await view.rerender(tree({ history, lastSyncedAt: newer }));
        await waitFor(() => expect(history.listByAthlete).toHaveBeenCalledTimes(2));

        expect(screen.getByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
        expect(screen.queryByText('No pudimos cargar el perfil')).toBeNull();
        expect(screen.getByRole('radio', { name: 'Libre 50 m' })).toBeChecked();
      });

      describe('other schools while the sync reads again', () => {
        const otherRow = {
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
        } as const;
        const otherSchool = () => {
          const results = createInMemoryOtherSchoolResultsRepository([otherRow]);
          return { results, listByEvent: jest.spyOn(results, 'listByEvent') };
        };

        it('does not ask the server again, nor empty the section, when a new sync leaves the event as it was', async () => {
          const { results, listByEvent } = otherSchool();
          // An imported result is the latest: each read builds its achievement anew, so `latest` is a new object on every silent read.
          const importedResults = { listByAthlete: jest.fn().mockResolvedValue([imported({ id: 'i9', swumOn: '2026-10-20' })]) };
          const props = { otherSchoolResults: results, online: true, importedResults };
          const view = await render(tree(props));
          expect(await screen.findByLabelText(/Otra escuela.*Solo en línea/)).toBeOnTheScreen();
          expect(listByEvent).toHaveBeenCalledTimes(1);

          await view.rerender(tree({ ...props, lastSyncedAt: newer }));

          expect(screen.getByLabelText(/Otra escuela.*Solo en línea/)).toBeOnTheScreen();
          expect(listByEvent).toHaveBeenCalledTimes(1);
        });

        it('asks again when the person chooses another event', async () => {
          const { results, listByEvent } = otherSchool();
          await render(tree({ otherSchoolResults: results, online: true }));
          await fireEvent.press(await screen.findByRole('radio', { name: 'Espalda 50 m' }));

          await waitFor(() => expect(listByEvent).toHaveBeenCalledTimes(2));
          expect(listByEvent).toHaveBeenLastCalledWith('a1', { stroke: 'BK', distance: '50m', pool: 'SCM' });
        });

        it('asks again when the sync brings a latest result of another event and the person had not chosen', async () => {
          const { results, listByEvent } = otherSchool();
          let current = races;
          const history = {
            ...createInMemoryHistoryRepository(races),
            listByAthlete: jest.fn(async () => current),
          };
          const props = { otherSchoolResults: results, online: true, history };
          const view = await render(tree(props));
          expect(await screen.findByRole('radio', { name: 'Libre 50 m' })).toBeChecked();
          expect(listByEvent).toHaveBeenCalledTimes(1);

          current = [...races, measurement({ id: 'm10', stroke: 'FL', hundredths: 3300, capturedAt: '2026-10-20T10:00:00.000Z' })];
          await view.rerender(tree({ ...props, lastSyncedAt: newer }));

          await waitFor(() => expect(listByEvent).toHaveBeenCalledTimes(2));
          expect(listByEvent).toHaveBeenLastCalledWith('a1', { stroke: 'FL', distance: '50m', pool: 'SCM' });
        });
      });

      it('does not read again when the sync is the same', async () => {
        const history = createInMemoryHistoryRepository(races);
        const byAthlete = jest.spyOn(history, 'listByAthlete');
        const view = await render(tree({ history }));
        expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();

        await view.rerender(tree({ history, lastSyncedAt: new Date('2026-10-20T10:00:00.000Z') }));

        expect(byAthlete).toHaveBeenCalledTimes(1);
      });
    });

    it('tells a failed opening read from having no data, and recovers with the retry', async () => {
      const history: HistoryRepository = {
        listByEvent: jest.fn(),
        listByAthlete: jest.fn().mockRejectedValueOnce(new Error('db')).mockResolvedValue(races),
        listByAthletesEvent: jest.fn(),
      };
      await show({ history });

      expect(await screen.findByText('No pudimos cargar el perfil')).toBeOnTheScreen();
      expect(screen.queryByText('Aún no hay tiempos')).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

      expect(await screen.findByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Libre 50 m' })).toBeChecked();
    });
  });
});
