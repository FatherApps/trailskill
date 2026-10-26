import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import { createInMemoryHistoryRepository, createInMemorySchoolAthleteRepository } from '../../athletes';
import { ThemeProvider } from '../../../core/theme';
import { createInMemoryCoachRepository, type CoachRepository } from '../data/coaches';
import { createConsoleAthletesRepository } from '../data/consoleAthletes';
import { createInMemorySchoolStructureRepository } from '../data/schoolStructure';
import { CoachesSection } from '../screens/CoachesSection';

// Importing the module indexes loads the PowerSync repositories, which need the sync layer mocked.
jest.mock('../../../core/sync', () => ({ db: {}, writeRecord: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

// Saturday 24 October 2026, local time.
const now = () => new Date(2026, 9, 24, 12, 0, 0);
const syncedFiveMinutesAgo = new Date(2026, 9, 24, 11, 55, 0);

// Synthetic data only.
const structure = createInMemorySchoolStructureRepository({
  categories: [],
  groups: [
    { id: 'g1', schoolId: 'school-a', name: 'Group A' },
    { id: 'g2', schoolId: 'school-a', name: 'Group B' },
    { id: 'g9', schoolId: 'school-b', name: 'Other group' },
  ],
  groupAssignments: [
    { coachId: 'coach-1', groupId: 'g2' },
    { coachId: 'coach-1', groupId: 'g1' },
    { coachId: 'coach-2', groupId: 'g2' },
    { coachId: 'coach-9', groupId: 'g9' },
  ],
  athleteAssignments: [],
  coachMemberships: [],
});

const authorizations = createInMemoryAuthorizationStatusRepository([]);
const history = createInMemoryHistoryRepository([]);

const athletes = createConsoleAthletesRepository({
  athletes: createInMemorySchoolAthleteRepository({
    athletes: [
      { id: 'a1', firstName: 'Ana', lastName: 'Test' },
      { id: 'a2', firstName: 'Beto', lastName: 'Test' },
      { id: 'a3', firstName: 'Cleo', lastName: 'Test' },
      { id: 'a4', firstName: 'Dani', lastName: 'Elsewhere' },
    ],
    athleteSchools: [
      { athleteId: 'a1', schoolId: 'school-a', categoryId: null },
      { athleteId: 'a2', schoolId: 'school-a', categoryId: null },
      { athleteId: 'a3', schoolId: 'school-a', categoryId: null },
      { athleteId: 'a4', schoolId: 'school-b', categoryId: null },
    ],
    athleteGroups: [
      { athleteId: 'a1', groupId: 'g1' },
      { athleteId: 'a2', groupId: 'g2' },
      { athleteId: 'a3', groupId: 'g1' },
      { athleteId: 'a4', groupId: 'g9' },
    ],
  }),
  authorizations,
  history,
  measurements: { countCapturedSince: jest.fn().mockResolvedValue(0) },
  structure,
});

const coachRepository = () =>
  createInMemoryCoachRepository([
    { schoolId: 'school-a', userId: 'coach-3', role: 'coach' },
    { schoolId: 'school-a', userId: 'coach-1', role: 'coach' },
    { schoolId: 'school-a', userId: 'coach-2', role: 'coach' },
    { schoolId: 'school-a', userId: 'admin-1', role: 'school_admin' },
    { schoolId: 'school-b', userId: 'coach-9', role: 'coach' },
  ]);

type Extra = Partial<React.ComponentProps<typeof CoachesSection>>;

const tree = (repository: CoachRepository, extra: Extra = {}) => (
    <ThemeProvider>
      <CoachesSection
        width={1280}
        schoolName="Escuela Test"
        onNavigate={jest.fn()}
        onInvite={jest.fn()}
        onDeactivate={jest.fn()}
        schoolId="school-a"
        repository={repository}
        structure={structure}
        athletes={athletes}
        lastSyncedAt={syncedFiveMinutesAgo}
        connection="connected"
        now={now}
        {...extra}
      />
    </ThemeProvider>
);

const show = (repository: CoachRepository, extra: Extra = {}) => render(tree(repository, extra));

const rows = () => screen.findAllByTestId('coach-card');

describe('CoachesSection', () => {
  it('lists the coaches of the school with Sin dato as name, their groups and their athletes, and no other school or admin', async () => {
    await show(coachRepository());

    expect(await rows()).toHaveLength(3);
    expect(screen.getAllByText('Sin dato')).toHaveLength(3);
    expect(screen.getByText('Group A · Group B · 3 deportistas')).toBeOnTheScreen();
    expect(screen.getByText('Group B · 1 deportista')).toBeOnTheScreen();
    expect(screen.getByText('Sin grupos · 0 deportistas')).toBeOnTheScreen();
    expect(screen.getByText('3 entrenadores · Actualizado hace 5 min')).toBeOnTheScreen();
    expect(screen.queryByText(/Other group/, { includeHiddenElements: true })).toBeNull();
  });

  it('still lists the coaches with their athlete counts when a read only the athletes list needs fails', async () => {
    jest.spyOn(authorizations, 'listGrantedAthleteIds').mockRejectedValue(new Error('boom'));
    jest.spyOn(history, 'listByAthletesEvent').mockRejectedValue(new Error('boom'));
    await show(coachRepository());

    expect(await rows()).toHaveLength(3);
    expect(screen.getByText('Group A · Group B · 3 deportistas')).toBeOnTheScreen();
    expect(screen.queryByText('No pudimos cargar los entrenadores')).toBeNull();
  });

  it('counts the athletes of each coach with the light read, not with the full athletes list', async () => {
    const listAthletes = jest.fn().mockRejectedValue(new Error('not needed'));
    const countAthletesByCoach = jest.fn().mockResolvedValue(new Map([['coach-2', 4]]));
    await show(coachRepository(), { athletes: { ...athletes, listAthletes, countAthletesByCoach } });

    expect(await rows()).toHaveLength(3);
    expect(screen.getByText('Group B · 4 deportistas')).toBeOnTheScreen();
    expect(listAthletes).not.toHaveBeenCalled();
    expect(countAthletesByCoach).toHaveBeenCalledWith('school-a');
  });

  // Reproduced: coaches synced and athletes not yet, every card says «0 deportistas» instead of a missing count. Needs a maintainer decision on the wording (#444).
  it.todo('does not show a missing athlete count as 0 deportistas while the athletes have not synced');

  it('shows the empty state for a school without coaches', async () => {
    await show(coachRepository(), { schoolId: 'school-z' });

    expect(await screen.findByText('Aún no hay entrenadores')).toBeOnTheScreen();
  });

  it('shows the error with a retry that loads again', async () => {
    const real = coachRepository();
    const listCoaches = jest.fn().mockRejectedValueOnce(new Error('boom')).mockImplementation(real.listCoaches);
    await show({ listCoaches });

    expect(await screen.findByText('No pudimos cargar los entrenadores')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    expect(await rows()).toHaveLength(3);
    expect(listCoaches).toHaveBeenCalledTimes(2);
  });

  it('retries from the invite sheet when the groups failed to load, keeping what was typed', async () => {
    const real = coachRepository();
    const listCoaches = jest.fn().mockImplementationOnce(real.listCoaches).mockRejectedValueOnce(new Error('boom')).mockImplementation(real.listCoaches);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const view = await show({ listCoaches });
    await rows();
    await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');

    await view.rerender(tree({ listCoaches }, { refreshKey: 1 }));
    expect(await screen.findByText('No pudimos cargar los grupos.')).toBeOnTheScreen();
    await fireEvent.press(within(screen.getByTestId('side-sheet')).getByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByRole('radio', { name: 'Group A' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Nombre')).toHaveDisplayValue('Rosa Londoño');
    expect(listCoaches).toHaveBeenCalledTimes(3);
  });

  it('shows the stored list under a dated banner without network', async () => {
    await show(coachRepository(), { connection: 'offline', lastSyncedAt: new Date(2026, 9, 23, 10, 0, 0) });

    await rows();
    expect(screen.getByTestId('banner')).toHaveTextContent(
      'Estás sin conexión Mostramos lo guardado en este dispositivo el 23 de octubre de 2026.',
    );
  });

  it('says nothing is stored when offline, never synced and there are no coaches', async () => {
    await show(coachRepository(), { schoolId: 'school-z', connection: 'offline', lastSyncedAt: null });

    expect(await screen.findByText('No hay entrenadores guardados en este dispositivo. Aparecerán cuando vuelva la conexión.')).toBeOnTheScreen();
  });

  it('does not load forever while connecting, never synced and without coaches: it says the first sync is running, not that the connection is missing', async () => {
    await show(coachRepository(), { schoolId: 'school-z', connection: 'connecting', lastSyncedAt: null });

    expect(await screen.findByText('Estamos sincronizando')).toBeOnTheScreen();
    expect(
      screen.getByText('Todavía no hay entrenadores guardados en este dispositivo. Aparecerán cuando termine la primera sincronización.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Estás sin conexión')).toBeNull();
    expect(screen.queryByTestId('state-view')).not.toHaveProp('accessibilityState', { busy: true });
  });

  it('logs the failed read and keeps showing the error', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const failure = new Error('boom');
    await show({ listCoaches: jest.fn().mockRejectedValue(failure) });

    expect(await screen.findByText('No pudimos cargar los entrenadores')).toBeOnTheScreen();
    expect(warn).toHaveBeenCalledWith('[school-console] Coaches could not be loaded', failure);
  });

  it('reads the group assignments together with the rest, not after them', async () => {
    const listCoachAssignments = jest.spyOn(structure, 'listCoachAssignments');
    // Never settles: whatever is called now was started in parallel with it.
    await show({ listCoaches: () => new Promise(() => {}) });

    await waitFor(() => expect(listCoachAssignments).toHaveBeenCalledWith('school-a', []));
  });

  it('offers the groups of the school, and only those, in the invite sheet', async () => {
    await show(coachRepository());
    await rows();

    await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));

    expect(screen.getByRole('radio', { name: 'Group A' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Group B' })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Other group' })).toBeNull();
  });

  it('does not take the groups for none while those of another school are read with the sheet open', async () => {
    const groups = await structure.listGroups('school-a');
    const reread = { ...structure, listGroups: jest.fn().mockResolvedValueOnce(groups).mockReturnValue(new Promise(() => {})) };
    const view = await show(coachRepository(), { structure: reread });
    await rows();
    await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa');
    await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');

    await view.rerender(tree(coachRepository(), { structure: reread, schoolId: 'school-b' }));

    expect(await screen.findByText('Cargando grupos…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Enviar invitación · Espera a que carguen los grupos' })).toBeDisabled();
  });

  it('keeps the sheet open and shows the error when the invitation of the caller rejects', async () => {
    const onInvite = jest.fn().mockRejectedValue(new Error('offline'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await show(coachRepository(), { onInvite });
    await rows();
    await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa');
    await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));

    expect(onInvite).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('side-sheet')).toBeOnTheScreen();
    expect(screen.getByText('No pudimos enviar la invitación. Inténtalo de nuevo.')).toBeOnTheScreen();
  });
});
