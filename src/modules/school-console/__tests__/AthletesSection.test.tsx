import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import { createInMemoryHistoryRepository, createInMemorySchoolAthleteRepository, type HistoryMeasurement } from '../../athletes';
import { ThemeProvider } from '../../../core/theme';
import { startOfWeek } from '../data/athletesList';
import { createConsoleAthletesRepository, type ConsoleAthlete, type ConsoleAthletesRepository } from '../data/consoleAthletes';
import { createInMemorySchoolStructureRepository } from '../data/schoolStructure';
import { AthletesSection } from '../screens/AthletesSection';

// Importing the module indexes loads the PowerSync repositories, which need the sync layer mocked.
jest.mock('../../../core/sync', () => ({ db: {}, writeRecord: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

// Saturday 24 October 2026, local time: the week started on Monday the 19th.
const now = () => new Date(2026, 9, 24, 12, 0, 0);
const syncedFiveMinutesAgo = new Date(2026, 9, 24, 11, 55, 0);

// Synthetic data only.
function measurement(id: string, athleteId: string, over: Partial<HistoryMeasurement> = {}): HistoryMeasurement {
  return {
    id,
    kind: 'race',
    athleteId,
    seriesId: null,
    arrivalPosition: null,
    hundredths: 3482,
    stroke: 'FR',
    distance: '50m',
    pool: 'SCM',
    sessionType: 'training',
    source: 'screen_button',
    createdBy: 'coach-a',
    deviceId: 'device-a',
    capturedAt: '2026-01-01T08:00:00Z',
    parentId: null,
    version: 1,
    editedBy: null,
    editedAt: null,
    editReason: null,
    origin: 'own',
    ...over,
  } as HistoryMeasurement;
}

const setup = () => {
  const countCapturedSince = jest.fn().mockResolvedValue(5);
  const repository = createConsoleAthletesRepository({
    athletes: createInMemorySchoolAthleteRepository({
      athletes: [
        { id: 'a1', firstName: 'Lucía', lastName: 'Ramírez' },
        { id: 'a2', firstName: 'Mateo', lastName: 'Castro' },
        { id: 'a3', firstName: 'Sara', lastName: 'Peña' },
        { id: 'a4', firstName: 'Otto', lastName: 'Elsewhere' },
      ],
      athleteSchools: [
        { athleteId: 'a1', schoolId: 'school-a', categoryId: 'c1' },
        { athleteId: 'a2', schoolId: 'school-a', categoryId: 'c2' },
        { athleteId: 'a3', schoolId: 'school-a', categoryId: 'c1' },
        { athleteId: 'a4', schoolId: 'school-b', categoryId: 'c9' },
      ],
      athleteGroups: [
        { athleteId: 'a1', groupId: 'g1' },
        { athleteId: 'a2', groupId: 'g2' },
        { athleteId: 'a3', groupId: 'g1' },
        { athleteId: 'a4', groupId: 'g9' },
      ],
    }),
    authorizations: createInMemoryAuthorizationStatusRepository([{ athleteId: 'a1', purpose: 'record_times', isGranted: true }]),
    history: createInMemoryHistoryRepository([measurement('m1', 'a1')]),
    measurements: { countCapturedSince },
    structure: createInMemorySchoolStructureRepository({
      categories: [
        { id: 'c1', schoolId: 'school-a', name: 'Infantil B', sortOrder: 1 },
        { id: 'c2', schoolId: 'school-a', name: 'Juvenil', sortOrder: 2 },
        { id: 'c9', schoolId: 'school-b', name: 'Otra escuela', sortOrder: 1 },
      ],
      groups: [
        { id: 'g1', schoolId: 'school-a', name: 'Grupo B' },
        { id: 'g2', schoolId: 'school-a', name: 'Grupo C' },
        { id: 'g9', schoolId: 'school-b', name: 'Grupo otra escuela' },
      ],
      groupAssignments: [
        { coachId: 'k1', groupId: 'g1' },
        { coachId: 'k2', groupId: 'g2' },
        { coachId: 'k9', groupId: 'g9' },
      ],
      athleteAssignments: [],
      athleteSchools: [
        { athleteId: 'a1', schoolId: 'school-a' },
        { athleteId: 'a2', schoolId: 'school-a' },
        { athleteId: 'a3', schoolId: 'school-a' },
        { athleteId: 'a4', schoolId: 'school-b' },
      ],
    }),
  });
  return { repository, countCapturedSince };
};

type Extra = Partial<React.ComponentProps<typeof AthletesSection>>;

const element = (repository: ConsoleAthletesRepository, extra: Extra = {}) => (
  <ThemeProvider>
    <AthletesSection
      width={1280}
      schoolName="Escuela Delfines"
      onNavigate={jest.fn()}
      schoolId="school-a"
      repository={repository}
      lastSyncedAt={syncedFiveMinutesAgo}
      connected
      now={now}
      {...extra}
    />
  </ThemeProvider>
);

const show = (repository: ConsoleAthletesRepository, extra: Extra = {}) => render(element(repository, extra));

const athleteRow = (name: RegExp) => screen.findByRole('button', { name });
const names = () => screen.queryAllByRole('button', { name: /^(Lucía Ramírez|Mateo Castro|Sara Peña|Otto Elsewhere)/ }).map((b) => b.props.accessibilityLabel.split(',')[0]);

const chooseFilter = async (filter: string, option: string) => {
  await fireEvent.press(screen.getByRole('button', { name: filter }));
  await fireEvent.press(await screen.findByRole('button', { name: option }));
};

describe('AthletesSection', () => {
  describe('the list', () => {
    it('lists the athletes of the school and none of another school', async () => {
      await show(setup().repository);

      await athleteRow(/^Lucía Ramírez/);
      expect(names()).toEqual(['Mateo Castro', 'Sara Peña', 'Lucía Ramírez']);
      expect(screen.queryByText(/Otto Elsewhere/, { includeHiddenElements: true })).toBeNull();
      expect(screen.getByText('3 activos · Actualizado hace 5 min')).toBeOnTheScreen();
    });

    it('names the personal best column after the event and the pool', async () => {
      await show(setup().repository);

      await athleteRow(/^Lucía Ramírez/);
      expect(screen.getByText('MP Libre 50 · 25 m')).toBeOnTheScreen();
    });

    it('shows Sin dato for the coach, whose name is not readable yet, and for a missing category', async () => {
      await show(setup().repository);

      expect(await athleteRow(/^Lucía Ramírez, Infantil B, Grupo B, Sin dato, Vigente/)).toBeOnTheScreen();
    });

    it('has no invite button and no profile button: neither flow exists in the console yet', async () => {
      await show(setup().repository);

      await athleteRow(/^Lucía Ramírez/);
      expect(screen.queryByRole('button', { name: 'Invitar acudiente' })).toBeNull();
    });
  });

  describe('indicators', () => {
    it('are computed over the whole list, count this week from Monday, and say Sin dato when they cannot be known', async () => {
      const { repository, countCapturedSince } = setup();
      await show(repository);

      expect(await screen.findByLabelText('Activos: 3')).toBeOnTheScreen();
      expect(screen.getByLabelText('Autorización pendiente: 2')).toBeOnTheScreen();
      expect(screen.getByLabelText('Mediciones esta semana: 5')).toBeOnTheScreen();
      expect(screen.getByLabelText('Por revisar: Sin dato')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Por revisar: 0')).toBeNull();
      expect(countCapturedSince).toHaveBeenCalledWith(['a2', 'a3', 'a1'], startOfWeek(now()));
    });

    it('do not change when the search narrows the list', async () => {
      await show(setup().repository);
      await athleteRow(/^Lucía Ramírez/);

      await fireEvent.changeText(screen.getByLabelText('Buscar por nombre'), 'sara');

      expect(names()).toEqual(['Sara Peña']);
      expect(screen.getByLabelText('Activos: 3')).toBeOnTheScreen();
    });
  });

  describe('search and filters', () => {
    it('combine with AND and every active chip clears on its own', async () => {
      await show(setup().repository);
      await athleteRow(/^Lucía Ramírez/);

      await chooseFilter('Categoría', 'Infantil B');
      expect(screen.queryByTestId('side-sheet')).toBeNull();
      expect(screen.getByRole('button', { name: 'Categoría: Infantil B' })).toBeSelected();
      expect(names()).toEqual(['Sara Peña', 'Lucía Ramírez']);

      await chooseFilter('Grupo', 'Grupo B');
      await fireEvent.changeText(screen.getByLabelText('Buscar por nombre'), 'sara');
      expect(names()).toEqual(['Sara Peña']);

      await fireEvent.press(screen.getByRole('button', { name: 'Grupo: Grupo B' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Categoría: Infantil B' }));
      expect(screen.getByRole('button', { name: 'Categoría' })).not.toBeSelected();
      expect(screen.getByRole('button', { name: 'Grupo' })).not.toBeSelected();
      expect(names()).toEqual(['Sara Peña']);

      await fireEvent.changeText(screen.getByLabelText('Buscar por nombre'), '');
      expect(names()).toEqual(['Mateo Castro', 'Sara Peña', 'Lucía Ramírez']);
    });

    it('lists only the options of the school and marks the chosen one', async () => {
      await show(setup().repository);
      await athleteRow(/^Lucía Ramírez/);

      await fireEvent.press(screen.getByRole('button', { name: 'Categoría' }));

      expect(screen.getByTestId('side-sheet')).toHaveProp('accessibilityLabel', 'Filtrar por categoría');
      expect(screen.getByRole('button', { name: 'Infantil B' })).not.toBeSelected();
      expect(screen.getByRole('button', { name: 'Juvenil' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Otra escuela' })).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Juvenil' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Grupo' }));
      expect(screen.getByRole('button', { name: 'Grupo B' })).toBeOnTheScreen();
    });

    it('closes the sheet with Cerrar without applying anything', async () => {
      await show(setup().repository);
      await athleteRow(/^Lucía Ramírez/);

      await fireEvent.press(screen.getByRole('button', { name: 'Categoría' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));

      expect(screen.queryByTestId('side-sheet')).toBeNull();
      expect(screen.getByRole('button', { name: 'Categoría' })).not.toBeSelected();
      expect(names()).toHaveLength(3);
    });

    it('says the coach names are not available yet instead of listing the coaches', async () => {
      await show(setup().repository);
      await athleteRow(/^Lucía Ramírez/);

      await fireEvent.press(screen.getByRole('button', { name: 'Entrenador' }));

      expect(screen.getByText('Los nombres de los entrenadores aún no están disponibles.')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'k1' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Sin dato' })).toBeNull();
    });

    it('shows a no-match state with an action that clears the search and the filters', async () => {
      await show(setup().repository);
      await athleteRow(/^Lucía Ramírez/);
      await chooseFilter('Categoría', 'Juvenil');
      await chooseFilter('Grupo', 'Grupo B');

      expect(screen.getByText('Ningún deportista coincide con la búsqueda')).toBeOnTheScreen();
      expect(names()).toEqual([]);
      // The school still has athletes: this is not the empty state.
      expect(screen.queryByText('Aún no hay deportistas')).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Limpiar búsqueda y filtros' }));

      expect(names()).toEqual(['Mateo Castro', 'Sara Peña', 'Lucía Ramírez']);
      expect(screen.getByRole('button', { name: 'Categoría' })).not.toBeSelected();
    });
  });

  describe('detail', () => {
    it('opens the athlete with Sin dato for the guardian and the contact, the bests, and no profile button', async () => {
      await show(setup().repository);

      await fireEvent.press(await athleteRow(/^Lucía Ramírez/));

      expect(screen.getByTestId('detail-panel')).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Lucía Ramírez' })).toBeOnTheScreen();
      expect(screen.getByLabelText('Infantil B', { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.getAllByText('Sin dato')).toHaveLength(2);
      expect(screen.queryByRole('button', { name: 'Ver perfil completo' })).toBeNull();
      expect(await screen.findByLabelText(/^Libre 50 · 25 m/)).toBeOnTheScreen();
    });

    it('closes with Cerrar', async () => {
      await show(setup().repository);
      await fireEvent.press(await athleteRow(/^Lucía Ramírez/));

      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));

      expect(screen.queryByTestId('detail-panel')).toBeNull();
    });
  });

  describe('without network', () => {
    it('shows the stored list under a dated banner', async () => {
      await show(setup().repository, { connected: false, lastSyncedAt: new Date(2026, 9, 23, 10, 0, 0) });

      await athleteRow(/^Lucía Ramírez/);
      expect(screen.getByTestId('banner')).toHaveTextContent(
        'Estás sin conexión Mostramos lo guardado en este dispositivo el 23 de octubre de 2026.',
      );
    });

    it('shows the undated banner when the last sync is not known', async () => {
      await show(setup().repository, { connected: false, lastSyncedAt: null });

      await athleteRow(/^Lucía Ramírez/);
      expect(screen.getByTestId('banner')).toHaveTextContent('Estás sin conexión Mostramos lo guardado en este dispositivo.');
      expect(screen.queryByText(/Actualizado hace/)).toBeNull();
    });

    it('says nothing is stored when there is no data and it never synced', async () => {
      await show(setup().repository, { schoolId: 'school-z', connected: false, lastSyncedAt: null });

      expect(await screen.findByText('No hay deportistas guardados en este dispositivo. Aparecerán cuando vuelva la conexión.')).toBeOnTheScreen();
    });

    it('shows the empty state, not the offline one, when it synced before and the school has no athletes', async () => {
      await show(setup().repository, { schoolId: 'school-z', connected: false });

      expect(await screen.findByText('Aún no hay deportistas')).toBeOnTheScreen();
    });
  });

  describe('loading, empty and error', () => {
    it('shows the loading state while the list is pending', async () => {
      const repository: ConsoleAthletesRepository = { ...setup().repository, listAthletes: () => new Promise(() => {}) };
      await show(repository);

      expect(screen.getByTestId('state-view')).toHaveProp('accessibilityState', { busy: true });
    });

    it('shows the empty state for a school without athletes', async () => {
      await show(setup().repository, { schoolId: 'school-z' });

      expect(await screen.findByText('Aún no hay deportistas')).toBeOnTheScreen();
    });

    it('shows the error with a retry that loads again', async () => {
      const real = setup().repository;
      const listAthletes = jest.fn().mockRejectedValueOnce(new Error('boom')).mockImplementation(real.listAthletes);
      await show({ ...real, listAthletes });

      expect(await screen.findByText('No pudimos cargar los deportistas')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

      expect(await athleteRow(/^Lucía Ramírez/)).toBeOnTheScreen();
      expect(listAthletes).toHaveBeenCalledTimes(2);
    });

    it('also fails when the measurement count fails', async () => {
      const real = setup().repository;
      await show({ ...real, countMeasurementsSince: () => Promise.reject(new Error('boom')) });

      expect(await screen.findByText('No pudimos cargar los deportistas')).toBeOnTheScreen();
    });
  });

  describe('reloading', () => {
    it('loads again when the refresh key changes and keeps showing the list meanwhile', async () => {
      const real = setup().repository;
      const listAthletes = jest.fn().mockImplementation(real.listAthletes);
      const repository = { ...real, listAthletes };
      const view = await show(repository, { refreshKey: 1 });
      await athleteRow(/^Lucía Ramírez/);

      await view.rerender(element(repository, { refreshKey: 2 }));

      expect(listAthletes).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId('state-view')).toBeNull();
      expect(await athleteRow(/^Lucía Ramírez/)).toBeOnTheScreen();
    });

    it('ignores a response that arrives after the school changed', async () => {
      const real = setup().repository;
      let resolveFirst: (athletes: ConsoleAthlete[]) => void = () => {};
      const listAthletes = jest
        .fn()
        .mockImplementationOnce(() => new Promise<ConsoleAthlete[]>((resolve) => (resolveFirst = resolve)))
        .mockImplementation(real.listAthletes);
      const repository = { ...real, listAthletes };
      const view = await show(repository, { schoolId: 'school-b' });

      await view.rerender(element(repository, { schoolId: 'school-a' }));
      await athleteRow(/^Lucía Ramírez/);
      const [stale] = await real.listAthletes('school-b');
      await resolveFirst([stale!]);

      expect(names()).toEqual(['Mateo Castro', 'Sara Peña', 'Lucía Ramírez']);
    });

    it('does not set state after it unmounts', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      let resolve: (athletes: ConsoleAthlete[]) => void = () => {};
      const repository: ConsoleAthletesRepository = {
        ...setup().repository,
        listAthletes: () => new Promise((r) => (resolve = r)),
      };
      const view = await show(repository);

      await view.unmount();
      await resolve([]);

      expect(error).not.toHaveBeenCalled();
    });
  });

  describe('a big school', () => {
    it('renders far fewer rows than athletes at first: the list is virtualized', async () => {
      const big: ConsoleAthlete[] = Array.from({ length: 300 }, (_, index) => ({
        id: `big-${index}`,
        name: `Deportista ${String(index).padStart(3, '0')}`,
        initials: 'DP',
        color: 'athlete-1',
        categoryId: null,
        category: null,
        categorySortOrder: null,
        groupIds: [],
        groups: [],
        coachIds: [],
        authorization: 'pending',
        bestTime: null,
      }));
      const repository: ConsoleAthletesRepository = {
        listAthletes: async () => big,
        countMeasurementsSince: async () => 0,
        listBests: async () => [],
      };
      await show(repository);

      await screen.findByRole('button', { name: /^Deportista 000/ });
      const rows = screen.queryAllByRole('button', { name: /^Deportista \d{3}/ });

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThan(60);
      expect(screen.getByLabelText('Activos: 300')).toBeOnTheScreen();
    });
  });
});
