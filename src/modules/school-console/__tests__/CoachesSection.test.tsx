import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import { createInMemoryHistoryRepository, createInMemorySchoolAthleteRepository } from '../../athletes';
import { ThemeProvider } from '../../../core/theme';
import { createInMemoryCoachInvitationRepository } from '../data/coachInvitations';
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
        invitations={createInMemoryCoachInvitationRepository()}
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

// Jest has no layout engine: the list is out of reach until its first measure, which is given here once the cards are drawn.
const rows = async () => {
  const cards = await screen.findAllByTestId('coach-card', { includeHiddenElements: true });
  await act(() => fireEvent(screen.getByTestId('coach-list', { includeHiddenElements: true }), 'layout', { nativeEvent: { layout: { width: 1000, height: 400, x: 0, y: 0 } } }));
  return cards;
};

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

  it('counts the athletes of each coach with the light read of the athletes, not with the full athletes list', async () => {
    const listAthletes = jest.fn().mockRejectedValue(new Error('not needed'));
    const listAthleteGroups = jest.fn().mockResolvedValue(['a1', 'a2', 'a3', 'a4'].map((id) => ({ id, groupIds: ['g2'] })));
    await show(coachRepository(), { athletes: { ...athletes, listAthletes, listAthleteGroups } });

    expect(await rows()).toHaveLength(3);
    expect(screen.getByText('Group B · 4 deportistas')).toBeOnTheScreen();
    expect(listAthletes).not.toHaveBeenCalled();
    expect(listAthleteGroups).toHaveBeenCalledWith('school-a');
  });

  it('counts from the groups and assignments it shows: each is read once per load, not again for the count', async () => {
    const listGroups = jest.spyOn(structure, 'listGroups');
    const listCoachAssignments = jest.spyOn(structure, 'listCoachAssignments');
    await show(coachRepository());

    expect(await rows()).toHaveLength(3);
    expect(listGroups).toHaveBeenCalledTimes(1);
    expect(listCoachAssignments).toHaveBeenCalledTimes(1);
  });

  it('lists the coaches with their groups and no count when the athletes read fails, never as 0 deportistas', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await show(coachRepository(), { athletes: { ...athletes, listAthleteGroups: jest.fn().mockRejectedValue(new Error('boom')) } });

    expect(await rows()).toHaveLength(3);
    expect(screen.getByText('Group A · Group B')).toBeOnTheScreen();
    expect(screen.getByText('Group B')).toBeOnTheScreen();
    expect(screen.getByText('Sin grupos')).toBeOnTheScreen();
    expect(screen.queryByText(/deportista/)).toBeNull();
    expect(screen.queryByText('No pudimos cargar los entrenadores')).toBeNull();
  });

  it('lists the coaches with no groups text and no count when the assignments read fails, never as «Sin grupos» or 0 deportistas', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await show(coachRepository(), { structure: { ...structure, listCoachAssignments: jest.fn().mockRejectedValue(new Error('boom')) } });

    expect(await rows()).toHaveLength(3);
    expect(screen.queryByText(/Sin grupos/)).toBeNull();
    expect(screen.queryByText(/Group A|Group B/)).toBeNull();
    expect(screen.queryByText(/deportista/)).toBeNull();
    expect(screen.queryByText('No pudimos cargar los entrenadores')).toBeNull();
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
  });

  it('reads only the groups again when the sheet retries them: not the coaches, the athletes or the assignments', async () => {
    const real = coachRepository();
    const listCoaches = jest.fn(real.listCoaches);
    const listAthleteGroups = jest.fn(athletes.listAthleteGroups);
    const listCoachAssignments = jest.fn(structure.listCoachAssignments);
    const listGroups = jest.fn().mockImplementationOnce(structure.listGroups).mockRejectedValueOnce(new Error('boom')).mockImplementation(structure.listGroups);
    const props = { structure: { ...structure, listGroups, listCoachAssignments }, athletes: { ...athletes, listAthleteGroups } };
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const view = await show({ listCoaches }, props);
    await rows();
    await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
    await view.rerender(tree({ listCoaches }, { ...props, refreshKey: 1 }));
    expect(await screen.findByText('No pudimos cargar los grupos.')).toBeOnTheScreen();
    const before = [listCoaches, listAthleteGroups, listCoachAssignments].map((read) => read.mock.calls.length);

    await fireEvent.press(within(screen.getByTestId('side-sheet')).getByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByRole('radio', { name: 'Group A' })).toBeOnTheScreen();
    expect(listGroups).toHaveBeenCalledTimes(3);
    expect([listCoaches, listAthleteGroups, listCoachAssignments].map((read) => read.mock.calls.length)).toEqual(before);
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

  it('keeps showing the error, whole, when the coaches or the groups cannot be read', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await show(coachRepository(), { structure: { ...structure, listGroups: jest.fn().mockRejectedValue(new Error('boom')) } });

    expect(await screen.findByText('No pudimos cargar los entrenadores')).toBeOnTheScreen();
    expect(screen.queryAllByTestId('coach-card')).toHaveLength(0);
  });

  describe('trace of failed reads', () => {
    const originalDev = (global as { __DEV__?: boolean }).__DEV__;
    afterEach(() => {
      (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    });

    const failing = (read: 'groups' | 'athleteCounts' | 'assignments', reason: unknown): [CoachRepository, Extra] => {
      const rejected = jest.fn().mockRejectedValue(reason);
      if (read === 'groups') return [coachRepository(), { structure: { ...structure, listGroups: rejected } }];
      if (read === 'assignments') return [coachRepository(), { structure: { ...structure, listCoachAssignments: rejected } }];
      return [coachRepository(), { athletes: { ...athletes, listAthleteGroups: rejected } }];
    };
    const settled = (read: string) => (read === 'groups' ? screen.findByText('No pudimos cargar los entrenadores') : rows());

    it.each([
      ['groups', true],
      ['athleteCounts', false],
      ['assignments', true],
      ['assignments', false],
    ] as const)('warns once, naming the %s read and the kind of the error, never its message (__DEV__ %s)', async (read, dev) => {
      (global as { __DEV__?: boolean }).__DEV__ = dev;
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await show(...failing(read, new Error('rosa@example.com')));

      await settled(read);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(`[school-console] Coaches could not be loaded: ${read}=Error`);
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/rosa|example\.com/i);
    });

    it.each([
      ['an Error with a code', Object.assign(new Error('rosa@example.com'), { code: '42501' }), 'Error 42501'],
      ['a rejection with a code that is not an Error', { code: 'PGRST301', message: 'rosa@example.com' }, 'object PGRST301'],
      ['a rejection with a status', { status: 503, message: 'rosa@example.com' }, 'object 503'],
      ['a string', 'rosa@example.com', 'string'],
      ['a code that is not a plain token', { code: 'rosa@example.com' }, 'object'],
    ])('tells %s apart without its message', async (_label, reason, kind) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await show(...failing('groups', reason));

      await settled('groups');
      expect(warn).toHaveBeenCalledWith(`[school-console] Coaches could not be loaded: groups=${kind}`);
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/rosa|example\.com/i);
    });

    it('writes one line when several reads fail in the same load', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await show(coachRepository(), {
        structure: { ...structure, listGroups: jest.fn().mockRejectedValue(new Error('boom')), listCoachAssignments: jest.fn().mockRejectedValue('boom') },
        athletes: { ...athletes, listAthleteGroups: jest.fn().mockRejectedValue(new Error('boom')) },
      });

      await settled('groups');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('[school-console] Coaches could not be loaded: groups=Error, athleteCounts=Error, assignments=string');
    });

    it('writes nothing when the effect was cleaned up before the read failed (school changed or screen gone)', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      let fail: (reason: unknown) => void = () => {};
      const listGroups = jest.fn().mockReturnValue(new Promise((_resolve, reject) => (fail = reject)));
      const view = await show(coachRepository(), { structure: { ...structure, listGroups } });

      await view.unmount();
      fail(new Error('boom'));
      await Promise.resolve();
      await Promise.resolve();

      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('reads the group assignments together with the rest, not after them', async () => {
    const listCoachAssignments = jest.spyOn(structure, 'listCoachAssignments');
    // Never settles: whatever is called now was started in parallel with it.
    await show({ listCoaches: () => new Promise(() => {}) });

    await waitFor(() => expect(listCoachAssignments).toHaveBeenCalledWith('school-a', expect.any(Array)));
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
    const invite = jest.fn().mockRejectedValue(new Error('offline'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await show(coachRepository(), { invitations: { invite } });
    await rows();
    await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa');
    await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));

    expect(invite).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('side-sheet')).toBeOnTheScreen();
    expect(screen.getByText('No pudimos enviar la invitación. Inténtalo de nuevo.')).toBeOnTheScreen();
  });

  it('hands the whole invitation to the invitations repository with the school id, and closes the sheet', async () => {
    const invitations = createInMemoryCoachInvitationRepository();
    await show(coachRepository(), { invitations });
    await rows();
    await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa');
    await fireEvent.changeText(screen.getByLabelText('Correo'), 'rosa@example.com');
    await fireEvent.press(screen.getByRole('radio', { name: 'Group B' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));

    await waitFor(() => expect(screen.queryByTestId('side-sheet')).toBeNull());
    expect(invitations.sent).toEqual([{ schoolId: 'school-a', invitation: { name: 'Rosa', email: 'rosa@example.com', groupIds: ['g2'] } }]);
  });

  it('shows Invitar disabled as Próximamente, and opens nothing, while there is no invitations repository', async () => {
    await show(coachRepository(), { invitations: undefined });
    await rows();

    const invite = screen.getByRole('button', { name: 'Invitar entrenador · Próximamente' });
    expect(invite).toBeDisabled();
    await fireEvent.press(invite);

    expect(screen.queryByTestId('side-sheet')).toBeNull();
  });

  it('keeps Desactivar disabled until issue 220', async () => {
    await show(coachRepository());
    await rows();

    expect(screen.getAllByRole('button', { name: 'Desactivar · Aún no disponible' })).toHaveLength(3);
  });
});
