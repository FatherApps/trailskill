import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
  authorizations: createInMemoryAuthorizationStatusRepository([]),
  history: createInMemoryHistoryRepository([]),
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

const show = (repository: CoachRepository, extra: Extra = {}) =>
  render(
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
    </ThemeProvider>,
  );

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

  it('keeps loading, not "no coaches", while connecting and never synced', async () => {
    const real = coachRepository();
    const listCoaches = jest.fn().mockImplementation(real.listCoaches);
    await show({ listCoaches }, { schoolId: 'school-z', connection: 'connecting', lastSyncedAt: null });
    await waitFor(() => expect(listCoaches).toHaveBeenCalled());
    await act(async () => {});

    expect(screen.getByTestId('state-view')).toHaveProp('accessibilityState', { busy: true });
    expect(screen.queryByText('Aún no hay entrenadores')).toBeNull();
  });
});
