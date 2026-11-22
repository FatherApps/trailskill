import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createInMemoryAdultDirectoryRepository, createInMemoryAuthorizationStatusRepository, createInMemoryInvitationRepository } from '../../accounts';
import { createInMemoryAthleteRegistrationRepository, createInMemoryHistoryRepository, createInMemorySchoolAthleteRepository, type AthleteSchoolEndRepository, type HistoryMeasurement } from '../../athletes';
import { ThemeProvider } from '../../../core/theme';
import { startOfWeek } from '../data/athletesList';
import { createInMemoryCategoriesRepository, type CategoriesRepository } from '../data/categories';
import { createInMemoryGuardianSharingRepository } from '../data/guardianSharing';
import { createConsoleAthletesRepository, type ConsoleAthlete, type ConsoleAthletesRepository } from '../data/consoleAthletes';
import { createInMemorySchoolStructureRepository } from '../data/schoolStructure';
import { AthletesSection } from '../screens/AthletesSection';

// Importing the module indexes loads the PowerSync repositories, which need the sync layer mocked.
jest.mock('../../../core/sync', () => ({ db: {}, writeRecord: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
// The real createURL reads the Expo manifest, which does not exist under Jest; the app's first scheme is swimcro (app.config.ts).
jest.mock('expo-linking', () => ({ createURL: (path: string) => `swimcro://${path}` }));

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
      coachMemberships: [],
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
      connection="connected"
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

    describe('guardians', () => {
      // Synthetic data only. a1 has two guardians (one without a profile contact), a2 has a guardian without a profile, a3 has none.
      const directory = (extra: { listGuardians?: jest.Mock } = {}) => {
        const real = createInMemoryAdultDirectoryRepository({
          profiles: [
            { userId: 'g1', firstName: 'Ana', lastName: 'Prueba', contactEmail: 'ana@example.test' },
            { userId: 'g3', firstName: 'Beto', lastName: 'Ejemplo', contactEmail: null },
            { userId: 'g4', firstName: 'Eva', lastName: 'Otra', contactEmail: 'eva@example.test' },
          ],
          managers: [
            { userId: 'g1', athleteId: 'a1', relation: 'guardian' },
            { userId: 'g3', athleteId: 'a1', relation: 'guardian' },
            { userId: 'g2', athleteId: 'a1', relation: 'guardian' },
            { userId: 'g2', athleteId: 'a2', relation: 'guardian' },
            { userId: 'g4', athleteId: 'a4', relation: 'self' },
          ],
        });
        return { ...real, ...extra };
      };

      it('shows the name and contact of the guardian of the athlete, joined when there are several, skipping guardians without a profile', async () => {
        await show(setup().repository, { guardians: directory() });

        await fireEvent.press(await athleteRow(/^Lucía Ramírez/));

        expect(await screen.findByText('Ana Prueba, Beto Ejemplo')).toBeOnTheScreen();
        // Contacts line up with the names: Beto has no contact, so his position says Sin dato.
        expect(screen.getByText('ana@example.test, Sin dato')).toBeOnTheScreen();
      });

      it('keeps every contact next to its own guardian when the first guardian has no contact', async () => {
        const listGuardians = jest.fn().mockResolvedValue([
          { userId: 'g5', name: 'Ana Prueba', contact: null },
          { userId: 'g6', name: 'Beto Ejemplo', contact: 'beto@example.test' },
        ]);
        await show(setup().repository, { guardians: { listGuardians } });

        await fireEvent.press(await athleteRow(/^Lucía Ramírez/));

        expect(await screen.findByText('Ana Prueba, Beto Ejemplo')).toBeOnTheScreen();
        expect(screen.getByText('Sin dato, beto@example.test')).toBeOnTheScreen();
      });

      it('skips a guardian without a profile and keeps a later missing contact in its own position', async () => {
        const listGuardians = jest.fn().mockResolvedValue([
          { userId: 'g5', name: 'Ana Prueba', contact: 'ana@example.test' },
          { userId: 'g6', name: null, contact: null },
          { userId: 'g7', name: 'Beto Ejemplo', contact: null },
        ]);
        await show(setup().repository, { guardians: { listGuardians } });

        await fireEvent.press(await athleteRow(/^Lucía Ramírez/));

        expect(await screen.findByText('Ana Prueba, Beto Ejemplo')).toBeOnTheScreen();
        expect(screen.getByText('ana@example.test, Sin dato')).toBeOnTheScreen();
      });

      it('shows the name and Sin dato for the contact when the only guardian has no contact', async () => {
        const listGuardians = jest.fn().mockResolvedValue([{ userId: 'g5', name: 'Ana Prueba', contact: null }]);
        await show(setup().repository, { guardians: { listGuardians } });

        await fireEvent.press(await athleteRow(/^Lucía Ramírez/));

        expect(await screen.findByText('Ana Prueba')).toBeOnTheScreen();
        expect(screen.getAllByText('Sin dato')).toHaveLength(1);
      });

      it('shows Sin dato for the guardian and the contact when the guardian has no profile or the athlete has no guardian', async () => {
        const guardians = directory();
        await show(setup().repository, { guardians });

        await fireEvent.press(await athleteRow(/^Mateo Castro/));
        expect(await screen.findAllByText('Sin dato')).toHaveLength(2);

        await fireEvent.press(await athleteRow(/^Sara Peña/));
        expect(screen.getAllByText('Sin dato')).toHaveLength(2);
      });

      it('never shows the guardian of the previous athlete while the next one is loading', async () => {
        let release: (list: { userId: string; name: string | null; contact: string | null }[]) => void = () => {};
        const listGuardians = jest
          .fn()
          .mockResolvedValueOnce([{ userId: 'g1', name: 'Ana Prueba', contact: 'ana@example.test' }])
          .mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
        await show(setup().repository, { guardians: { listGuardians } });
        await fireEvent.press(await athleteRow(/^Lucía Ramírez/));
        expect(await screen.findByText('Ana Prueba')).toBeOnTheScreen();

        await fireEvent.press(await athleteRow(/^Mateo Castro/));

        expect(screen.queryByText('Ana Prueba')).toBeNull();
        expect(screen.queryByText('ana@example.test')).toBeNull();
        expect(screen.getAllByText('Sin dato')).toHaveLength(2);
        await act(async () => release([{ userId: 'g5', name: 'Gabo Nuevo', contact: null }]));
        expect(await screen.findByText('Gabo Nuevo')).toBeOnTheScreen();
      });

      it('shows Sin dato when the guardians cannot be read', async () => {
        await show(setup().repository, { guardians: { listGuardians: jest.fn().mockRejectedValue(new Error('boom')) } });

        await fireEvent.press(await athleteRow(/^Lucía Ramírez/));

        await waitFor(() => expect(screen.getAllByText('Sin dato')).toHaveLength(2));
      });
    });

    it('closes with Cerrar', async () => {
      await show(setup().repository);
      await fireEvent.press(await athleteRow(/^Lucía Ramírez/));

      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));

      expect(screen.queryByTestId('detail-panel')).toBeNull();
    });
  });

  describe('end of the link', () => {
    const open = async (swimmerEnd?: AthleteSchoolEndRepository) => {
      const { repository } = setup();
      const listAthletes = jest.spyOn(repository, 'listAthletes');
      await show(repository, { swimmerEnd });
      await fireEvent.press(await athleteRow(/^Lucía Ramírez/));
      return { listAthletes };
    };
    const end = async () => {
      await fireEvent.press(await screen.findByRole('button', { name: 'Dar de baja a un nadador' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Dar de baja' }));
    };

    it('has no baja button without the repository that ends the link', async () => {
      await open();

      expect(screen.queryByRole('button', { name: 'Dar de baja a un nadador' })).toBeNull();
    });

    it('ends the link of the open swimmer in the school of the console, closes the detail and reads the list again', async () => {
      const swimmerEnd = { endLink: jest.fn().mockResolvedValue(undefined) };
      const { listAthletes } = await open(swimmerEnd);
      listAthletes.mockClear();

      await end();

      await waitFor(() => expect(swimmerEnd.endLink).toHaveBeenCalledWith('a1', 'school-a'));
      expect(swimmerEnd.endLink).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(listAthletes).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Dar de baja a un nadador' })).toBeNull());
    });

    it.each([
      ['not_allowed', 'Solo un administrador de la escuela puede dar de baja a un nadador.'],
      ['not_enrolled', 'Este nadador ya no está en tu escuela.'],
      ['Failed to fetch', 'No pudimos dar de baja al nadador. Revisa la conexión e inténtalo de nuevo.'],
    ])('shows the failure %s and keeps the swimmer', async (code, message) => {
      await open({ endLink: jest.fn().mockRejectedValue(new Error(code)) });

      await end();

      expect(await screen.findByText(message)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Dar de baja a un nadador' })).toBeOnTheScreen();
    });
  });

  describe('category selector', () => {
    // Synthetic categories of school-a; c3 is inactive and c9 belongs to another school.
    // The athletes list (setup) gives a1 the category c1 and a2 the category c2.
    const memory = (juvenilActive = true) =>
      createInMemoryCategoriesRepository({
        categories: [
          { id: 'c1', schoolId: 'school-a', name: 'Infantil B', sortOrder: 0, active: true },
          { id: 'c2', schoolId: 'school-a', name: 'Juvenil', sortOrder: 1, active: juvenilActive },
          { id: 'c3', schoolId: 'school-a', name: 'Máster', sortOrder: 2, active: false },
          { id: 'c9', schoolId: 'school-b', name: 'Otra escuela', sortOrder: 0, active: true },
        ],
        athleteSchools: [
          { id: 'r1', athleteId: 'a1', schoolId: 'school-a', categoryId: 'c1' },
          { id: 'r2', athleteId: 'a2', schoolId: 'school-a', categoryId: 'c2' },
        ],
      });
    const open = async (categories: CategoriesRepository, name: RegExp = /^Lucía Ramírez/) => {
      const { repository } = setup();
      const listAthletes = jest.spyOn(repository, 'listAthletes');
      await show(repository, { categories });
      await fireEvent.press(await athleteRow(name));
      return { listAthletes };
    };
    const option = (name: string) => screen.findByRole('button', { name });

    it('assigns the chosen active category and reads the list again', async () => {
      const categories = memory();
      const { listAthletes } = await open(categories);
      await option('Juvenil');
      listAthletes.mockClear();

      await fireEvent.press(screen.getByRole('button', { name: 'Juvenil' }));

      await waitFor(() => expect(categories.athleteCategory('a1', 'school-a')).toBe('c2'));
      await waitFor(() => expect(listAthletes).toHaveBeenCalledTimes(1));
    });

    it('offers only the active categories of the school, and the current one marked', async () => {
      await open(memory());

      expect(await option('Infantil B')).toBeSelected();
      expect(screen.getByRole('button', { name: 'Juvenil' })).not.toBeSelected();
      expect(screen.getByRole('button', { name: 'Sin categoría' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /Máster/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /Otra escuela/ })).toBeNull();
    });

    it('still shows the inactive category an athlete already has', async () => {
      await open(memory(false), /^Mateo Castro/);

      expect(await option('Juvenil · Inactiva')).toBeSelected();
      expect(screen.queryByRole('button', { name: 'Máster' })).toBeNull();
    });

    it('clears the category with Sin categoría', async () => {
      const categories = memory();
      await open(categories);

      await fireEvent.press(await option('Sin categoría'));

      await waitFor(() => expect(categories.athleteCategory('a1', 'school-a')).toBeNull());
    });

    it('shows the error of the repository and keeps the category', async () => {
      const categories = memory();
      await open(categories);
      await option('Juvenil');
      jest.spyOn(categories, 'assignAthlete').mockRejectedValue(new Error('category_inactive'));

      await fireEvent.press(screen.getByRole('button', { name: 'Juvenil' }));

      expect(await screen.findByText('Esa categoría está inactiva: elige otra.')).toBeOnTheScreen();
      expect(categories.athleteCategory('a1', 'school-a')).toBe('c1');
    });

    it('has no selector without a categories repository', async () => {
      await show(setup().repository);
      await fireEvent.press(await athleteRow(/^Lucía Ramírez/));

      expect(screen.queryByRole('button', { name: 'Sin categoría' })).toBeNull();
    });
  });

  describe('without network', () => {
    it('shows the stored list under a dated banner', async () => {
      await show(setup().repository, { connection: 'offline', lastSyncedAt: new Date(2026, 9, 23, 10, 0, 0) });

      await athleteRow(/^Lucía Ramírez/);
      expect(screen.getByTestId('banner')).toHaveTextContent(
        'Estás sin conexión Mostramos lo guardado en este dispositivo el 23 de octubre de 2026.',
      );
    });

    it('shows the undated banner when the last sync is not known', async () => {
      await show(setup().repository, { connection: 'offline', lastSyncedAt: null });

      await athleteRow(/^Lucía Ramírez/);
      expect(screen.getByTestId('banner')).toHaveTextContent('Estás sin conexión Mostramos lo guardado en este dispositivo.');
      expect(screen.queryByText(/Actualizado hace/)).toBeNull();
    });

    it('says nothing is stored when there is no data and it never synced', async () => {
      await show(setup().repository, { schoolId: 'school-z', connection: 'offline', lastSyncedAt: null });

      expect(await screen.findByText('No hay deportistas guardados en este dispositivo. Aparecerán cuando vuelva la conexión.')).toBeOnTheScreen();
    });

    it('shows the empty state, not the offline one, when it synced before and the school has no athletes', async () => {
      await show(setup().repository, { schoolId: 'school-z', connection: 'offline' });

      expect(await screen.findByText('Aún no hay deportistas')).toBeOnTheScreen();
    });
  });

  describe('while connecting', () => {
    it('shows the list without the offline banner', async () => {
      await show(setup().repository, { connection: 'connecting' });

      await athleteRow(/^Lucía Ramírez/);
      expect(screen.queryByText('Estás sin conexión')).toBeNull();
    });

    it('does not load forever when it never synced and the list is empty: it says the first sync is running, not that the connection is missing', async () => {
      await show(setup().repository, { schoolId: 'school-z', connection: 'connecting', lastSyncedAt: null });

      expect(await screen.findByText('Estamos sincronizando')).toBeOnTheScreen();
      expect(
        screen.getByText('Todavía no hay deportistas guardados en este dispositivo. Aparecerán cuando termine la primera sincronización.'),
      ).toBeOnTheScreen();
      expect(screen.queryByText('Estás sin conexión')).toBeNull();
      expect(screen.queryByTestId('state-view')).not.toHaveProp('accessibilityState', { busy: true });
    });

    it('shows the empty state when it synced before and the school has no athletes', async () => {
      await show(setup().repository, { schoolId: 'school-z', connection: 'connecting' });

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

  describe('the bests of the open athlete', () => {
    it('says they could not be loaded, not that there are none, when the read fails', async () => {
      const repository: ConsoleAthletesRepository = { ...setup().repository, listBests: () => Promise.reject(new Error('read failed')) };
      await show(repository);

      await fireEvent.press(await athleteRow(/^Lucía Ramírez/));

      expect(await screen.findByText('No se pudieron cargar las marcas')).toBeOnTheScreen();
      expect(screen.queryByText('Aún no hay marcas')).toBeNull();
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
        listAthleteGroups: async () => [],
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

  describe('what the guardian sees', () => {
    it('shows the switch of the open swimmer when the section has the sharing repository', async () => {
      await show(setup().repository, { sharing: { repository: createInMemoryGuardianSharingRepository() } });
      await fireEvent.press(await athleteRow(/Lucía Ramírez/));

      expect(await screen.findByRole('radio', { name: 'Compartir todos' })).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Compartir todos los tiempos con el acudiente' })).toBeOnTheScreen();
    });

    it('shows no controls without it', async () => {
      await show(setup().repository);
      await fireEvent.press(await athleteRow(/Lucía Ramírez/));

      expect(await screen.findByRole('header', { name: 'Lucía Ramírez' })).toBeOnTheScreen();
      expect(screen.queryByRole('radio', { name: 'Compartir todos' })).not.toBeOnTheScreen();
    });
  });

  describe('the claim link of a registered swimmer', () => {
    // Registers swimmer a1 (Lucía Ramírez, who the console lists) as the signed-in admin, then opens her detail.
    const open = async (extra: Extra = {}) => {
      const repository = createInMemoryAthleteRegistrationRepository({ now });
      repository.adminSchoolIds = ['school-a'];
      const first = await repository.register({ athleteId: 'a1', schoolId: 'school-a', firstName: 'Lucía', lastName: 'Ramírez', guardianAuthorizationCollected: true });
      const share = jest.fn().mockResolvedValue(undefined);
      await show(setup().repository, { registration: { repository, newId: () => 'athlete-new' }, share, ...extra });
      await fireEvent.press(await athleteRow(/^Lucía Ramírez/));
      return { repository, share, first };
    };

    it('shows the open link of the swimmer nobody claimed yet and shares the same token again', async () => {
      const { share, first } = await open();

      expect(await screen.findByLabelText(/Vigente hasta el 7 de noviembre de 2026/, { includeHiddenElements: true })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Compartir enlace' }));

      expect(share.mock.calls[0][0]).toContain(`swimcro://claim/${first.token}`);
    });

    it('renews the link and shares the new token; the old one no longer works', async () => {
      const { repository, share, first } = await open();
      await fireEvent.press(await screen.findByRole('button', { name: 'Renovar enlace' }));

      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      // The call is over when the button is not busy any more: no update lands after the test.
      await waitFor(() => expect(screen.getByRole('button', { name: 'Renovar enlace' })).not.toBeBusy());
      const message = share.mock.calls[0][0] as string;
      expect(message).not.toContain(first.token);
      expect(message).toContain('swimcro://claim/');
      await expect(repository.findLink('a1')).resolves.toMatchObject({ status: 'open' });
      await expect(repository.claim({ token: first.token, relation: 'guardian', acceptedAt: '2026-10-24T12:00:00.000Z', authorizations: [] })).rejects.toThrow('link_not_found');
    });

    it('keeps the new token and shares it when the read after a renew fails: the old token is already dead', async () => {
      const { repository, share, first } = await open();
      await screen.findByRole('button', { name: 'Renovar enlace' });
      jest.spyOn(repository, 'findLink').mockRejectedValue(new Error('Failed to fetch'));

      await fireEvent.press(screen.getByRole('button', { name: 'Renovar enlace' }));

      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Renovar enlace' })).not.toBeBusy());
      expect(share.mock.calls[0][0]).not.toContain(first.token);
      expect(screen.queryByText(/No pudimos cambiar el enlace/)).toBeNull();
      // The panel now shares the new token, not the old one.
      await fireEvent.press(screen.getByRole('button', { name: 'Compartir enlace' }));
      expect(share.mock.calls[1][0]).toBe(share.mock.calls[0][0]);
    });

    it('says so when the system share sheet fails, from Compartir enlace and after a renew, and keeps the link', async () => {
      const { share } = await open();
      share.mockRejectedValue(new Error('no share'));
      await fireEvent.press(await screen.findByRole('button', { name: 'Compartir enlace' }));
      expect(await screen.findByText('No pudimos compartir el enlace. Inténtalo de nuevo.')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Renovar enlace' }));

      await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('No pudimos compartir el enlace. Inténtalo de nuevo.')).toBeOnTheScreen();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Renovar enlace' })).not.toBeBusy());
      expect(screen.queryByText(/No pudimos cambiar el enlace/)).toBeNull();
    });

    it('revokes after the confirmation, then only offers a new link', async () => {
      const { repository } = await open();
      await fireEvent.press(await screen.findByRole('button', { name: 'Revocar enlace' }));
      await fireEvent.press(screen.getAllByRole('button', { name: 'Revocar enlace' }).at(-1)!);

      expect(await screen.findByLabelText('Revocado', { includeHiddenElements: true })).toBeOnTheScreen();
      await expect(repository.findLink('a1')).resolves.toMatchObject({ status: 'revoked' });
      expect(screen.getByRole('button', { name: 'Renovar y compartir' })).toBeOnTheScreen();
    });

    it('says what a refusal means and keeps the panel', async () => {
      const { repository } = await open();
      repository.endedAthleteIds = ['a1'];
      await fireEvent.press(await screen.findByRole('button', { name: 'Renovar enlace' }));

      expect(await screen.findByText(/ya reclamó a este nadador o la escuela lo dio de baja/)).toBeOnTheScreen();
    });

    it('shows no panel for a claimed link', async () => {
      const repository = createInMemoryAthleteRegistrationRepository({ now });
      const { token } = await repository.register({ athleteId: 'a1', schoolId: 'school-a', firstName: 'Lucía', lastName: 'Ramírez', guardianAuthorizationCollected: true });
      await repository.claim({ token, relation: 'guardian', acceptedAt: '2026-10-24T12:00:00.000Z', authorizations: [] });
      await show(setup().repository, { registration: { repository, newId: () => 'athlete-new' } });

      await fireEvent.press(await athleteRow(/^Lucía Ramírez/));

      expect(await screen.findByRole('header', { name: 'Lucía Ramírez' })).toBeOnTheScreen();
      expect(screen.queryByText('Enlace de reclamo')).toBeNull();
    });

    it('shows no panel for a swimmer that has no link', async () => {
      await show(setup().repository, { registration: { repository: createInMemoryAthleteRegistrationRepository({ now }), newId: () => 'athlete-new' } });

      await fireEvent.press(await athleteRow(/^Lucía Ramírez/));

      expect(await screen.findByRole('header', { name: 'Lucía Ramírez' })).toBeOnTheScreen();
      expect(screen.queryByText('Enlace de reclamo')).toBeNull();
    });
  });

  describe('registering a swimmer without an account', () => {
    const open = async (extra: Extra = {}) => {
      const repository = createInMemoryAthleteRegistrationRepository({ now });
      const share = jest.fn().mockResolvedValue(undefined);
      await show(setup().repository, { registration: { repository, newId: () => 'athlete-new' }, share, ...extra });
      await athleteRow(/^Lucía Ramírez/);
      await fireEvent.press(screen.getByRole('button', { name: 'Dar de alta' }));
      return { repository, share };
    };
    const fillAndDeclare = async () => {
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Ana');
      await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Prueba');
      await fireEvent.press(screen.getByRole('checkbox'));
    };

    it('has no «Dar de alta» button unless the console passes the registration', async () => {
      await show(setup().repository);
      await athleteRow(/^Lucía Ramírez/);

      expect(screen.queryByRole('button', { name: 'Dar de alta' })).toBeNull();
    });

    it('registers with the declaration, a device-made id and this school, then shares the claim link with its token', async () => {
      const { repository, share } = await open();
      await fillAndDeclare();

      await fireEvent.press(screen.getByRole('button', { name: /^Dar de alta/ }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Compartir enlace' }));

      expect(repository.registered).toEqual([
        { athleteId: 'athlete-new', schoolId: 'school-a', firstName: 'Ana', lastName: 'Prueba', guardianAuthorizationCollected: true },
      ]);
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect(share.mock.calls[0][0]).toContain(`swimcro://claim/${'1'.padStart(32, '0')}`);
    });

    it('registers nothing while the declaration is not checked', async () => {
      const { repository } = await open();
      await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Ana');
      await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Prueba');

      await fireEvent.press(screen.getByRole('button', { name: /^Dar de alta ·/ }));

      expect(repository.registered).toEqual([]);
    });

    it('shows the refusal of the server and a retry registers a single swimmer with the same id', async () => {
      const { repository } = await open();
      repository.rejectWith = 'not_allowed';
      await fillAndDeclare();
      await fireEvent.press(screen.getByRole('button', { name: /^Dar de alta/ }));
      expect(await screen.findByText(/Solo un administrador activo/)).toBeOnTheScreen();

      repository.rejectWith = undefined;
      await fireEvent.press(screen.getByRole('button', { name: /^Dar de alta/ }));
      await screen.findByText('Ana Prueba quedó registrado.');
      await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));

      expect(repository.registered.map((r) => r.athleteId)).toEqual(['athlete-new']);
      expect(screen.queryByLabelText('Nombre')).toBeNull();
    });
  });

  describe('inviting a family', () => {
    const groupRows = (...groups: [string, string, string][]) =>
      createInMemorySchoolStructureRepository({
        categories: [],
        groups: groups.map(([id, schoolId, name]) => ({ id, schoolId, name })),
        groupAssignments: [],
        athleteAssignments: [],
        coachMemberships: [],
      });
    const token = (n: number) => String(n).padStart(32, '0');

    const invite = async (extra: { groups?: ReturnType<typeof groupRows>; invitations?: ReturnType<typeof createInMemoryInvitationRepository> } = {}) => {
      const invitations = extra.invitations ?? createInMemoryInvitationRepository();
      const share = jest.fn().mockResolvedValue(undefined);
      const structure = extra.groups ?? groupRows(['g1', 'school-a', 'Grupo B']);
      await show(setup().repository, { structure, invitations, share });
      await athleteRow(/^Lucía Ramírez/);
      return { invitations, share, structure };
    };
    const press = () => fireEvent.press(screen.getByRole('button', { name: 'Invitar acudiente' }));

    it('creates an invitation for the only group of the school and shares the link with its token', async () => {
      const { invitations, share } = await invite();
      await press();

      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect(invitations.created).toEqual([{ schoolId: 'school-a', groupId: 'g1' }]);
      const message = share.mock.calls[0][0] as string;
      expect(message).toContain(`swimcro://invite/${token(1)}`);
      expect(message).toContain('Escuela Delfines');
      // The day depends on the time zone of the machine, the month and the year do not.
      expect(message).toMatch(/ de noviembre de 2026\.$/);
    });

    it('asks which group when the school has several, and invites to the one chosen', async () => {
      const { invitations, share } = await invite({ groups: groupRows(['g1', 'school-a', 'Grupo B'], ['g2', 'school-a', 'Grupo C'], ['g9', 'school-b', 'Otra escuela']) });
      await press();

      expect(invitations.created).toEqual([]);
      expect(screen.queryByRole('button', { name: 'Grupo otra escuela' })).toBeNull();
      await fireEvent.press(await screen.findByRole('button', { name: 'Grupo C' }));

      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect(invitations.created).toEqual([{ schoolId: 'school-a', groupId: 'g2' }]);
    });

    it('says so, creates nothing and shares nothing when the school has no group', async () => {
      const { invitations, share } = await invite({ groups: groupRows(['g9', 'school-b', 'Otra escuela']) });
      await press();

      expect(await screen.findByText(/aún no tiene grupos/)).toBeOnTheScreen();
      expect(invitations.created).toEqual([]);
      expect(share).not.toHaveBeenCalled();
    });

    it('says so, creates nothing and shares nothing when the groups cannot be read', async () => {
      const structure = { listGroups: jest.fn().mockRejectedValue(new Error('db')) };
      const { invitations, share } = await invite({ groups: structure as unknown as ReturnType<typeof groupRows> });
      await press();

      expect(await screen.findByText(/No pudimos leer los grupos/)).toBeOnTheScreen();
      expect(invitations.created).toEqual([]);
      expect(share).not.toHaveBeenCalled();
    });

    it('shows an error, shares nothing and leaves nothing behind when the invitation cannot be created; retrying creates a single one', async () => {
      const invitations = createInMemoryInvitationRepository({ failing: true });
      const { share } = await invite({ invitations });
      await press();

      expect(await screen.findByText(/No pudimos crear la invitación/)).toBeOnTheScreen();
      expect(invitations.created).toEqual([]);
      expect(share).not.toHaveBeenCalled();

      invitations.failing = false;
      await press();

      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect(invitations.created).toEqual([{ schoolId: 'school-a', groupId: 'g1' }]);
      expect(screen.queryByText(/No pudimos crear la invitación/)).toBeNull();
      expect(share.mock.calls[0][0]).toContain(`swimcro://invite/${token(1)}`);
    });

    it('keeps the invitation and shows no error when the share sheet fails', async () => {
      const { invitations, share } = await invite();
      share.mockRejectedValue(new Error('share sheet failed'));
      await press();

      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect(invitations.created).toHaveLength(1);
      expect(screen.queryByText(/No pudimos crear la invitación/)).toBeNull();
    });

    it('creates one invitation when the button is pressed twice before the first finishes', async () => {
      let finish: (invitation: { token: string; expiresAt: string }) => void = () => undefined;
      const create = jest.fn(() => new Promise<{ token: string; expiresAt: string }>((resolve) => (finish = resolve)));
      const share = jest.fn().mockResolvedValue(undefined);
      await show(setup().repository, { structure: groupRows(['g1', 'school-a', 'Grupo B']), invitations: { create }, share });
      await athleteRow(/^Lucía Ramírez/);
      await press();
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      await press();

      await act(async () => finish({ token: token(1), expiresAt: '2026-11-08T12:00:00.000Z' }));
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('has no button without the invitation repository or without the groups', async () => {
      const withoutGroups = await show(setup().repository, { invitations: createInMemoryInvitationRepository() });
      await athleteRow(/^Lucía Ramírez/);
      expect(screen.queryByRole('button', { name: 'Invitar acudiente' })).toBeNull();
      withoutGroups.unmount();

      await show(setup().repository, { structure: groupRows(['g1', 'school-a', 'Grupo B']) });
      await athleteRow(/^Lucía Ramírez/);
      expect(screen.queryByRole('button', { name: 'Invitar acudiente' })).toBeNull();
    });
  });
});
