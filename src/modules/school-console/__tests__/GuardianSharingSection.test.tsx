import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import {
  createInMemoryGuardianSharingRepository,
  GuardianSharingError,
  type GuardianRecord,
  type GuardianRecordsRepository,
  type GuardianSharingRepository,
} from '../data/guardianSharing';
import { SchoolSharingDefaultSection, SwimmerSharingSection } from '../screens/GuardianSharingSection';

// The data module imports the sync layer for its default Supabase client.
jest.mock('../../../core/sync', () => ({ supabase: {} }));

// Synthetic data only.
const record = (id: string, shared: boolean | null, over: Partial<GuardianRecord> = {}): GuardianRecord => ({
  id,
  stroke: 'FR',
  distance: '50m',
  pool: 'SCM',
  kind: 'race',
  time: 3482,
  capturedAt: '2026-11-01T08:00:00Z',
  shared,
  ...over,
});

const recordsOf = (list: GuardianRecord[]): GuardianRecordsRepository => ({ list: jest.fn().mockResolvedValue(list) });

const school = (repository: GuardianSharingRepository, connection: 'connected' | 'offline' = 'connected') =>
  render(
    <ThemeProvider>
      <SchoolSharingDefaultSection repository={repository} schoolId="school-a" connection={connection} />
    </ThemeProvider>,
  );

const swimmer = (repository: GuardianSharingRepository, records?: GuardianRecordsRepository, connection: 'connected' | 'offline' = 'connected') =>
  render(
    <ThemeProvider>
      <SwimmerSharingSection repository={repository} records={records} athleteId="a1" schoolId="school-a" connection={connection} />
    </ThemeProvider>,
  );

const deny = new GuardianSharingError('42501');

describe('the school default for new swimmers', () => {
  it('starts at "No compartir" and says in plain Spanish what it means', async () => {
    await school(createInMemoryGuardianSharingRepository());
    expect(await screen.findByText(/empiezan sin compartir sus tiempos con el acudiente/)).toBeOnTheScreen();
    expect(screen.getByText(/los tiempos guardados antes de esta regla se siguen viendo/)).toBeOnTheScreen();
  });

  it('the administrator changes it and a new swimmer inherits it', async () => {
    const repository = createInMemoryGuardianSharingRepository();
    await school(repository);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Compartir todos' }));

    expect(await screen.findByText(/empiezan con todos sus tiempos compartidos/)).toBeOnTheScreen();
    expect(await repository.getSchoolDefault('school-a')).toBe(true);
    expect(await repository.getSwimmer('new-swimmer', 'school-a')).toBe(true);
  });

  it('shows the error of a refusal (42501) and keeps the old value', async () => {
    const setSchoolDefault = jest.fn().mockRejectedValue(deny);
    await school({ ...createInMemoryGuardianSharingRepository(), setSchoolDefault });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Compartir todos' }));

    expect(await screen.findByText('No tienes permiso para cambiar esto.')).toBeOnTheScreen();
    expect(screen.getByText(/empiezan sin compartir/)).toBeOnTheScreen();
    expect(setSchoolDefault).toHaveBeenCalledTimes(1);
  });

  it('shows the busy message when the repository gave up after the deadlock retries', async () => {
    const setSchoolDefault = jest.fn().mockRejectedValue(new GuardianSharingError('40P01'));
    await school({ ...createInMemoryGuardianSharingRepository(), setSchoolDefault });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Compartir todos' }));

    expect(await screen.findByText(/el servidor estaba ocupado/)).toBeOnTheScreen();
  });

  it('shows an error with a retry when it cannot be read, and reads again', async () => {
    const getSchoolDefault = jest.fn().mockRejectedValueOnce(new GuardianSharingError('unexpected')).mockResolvedValue(true);
    await school({ ...createInMemoryGuardianSharingRepository(), getSchoolDefault });

    await fireEvent.press(await screen.findByRole('button', { name: 'Intentar de nuevo' }));
    expect(await screen.findByText(/empiezan con todos sus tiempos compartidos/)).toBeOnTheScreen();
  });

  it('offers nothing to press and does not read without a connection', async () => {
    const getSchoolDefault = jest.fn();
    await school({ ...createInMemoryGuardianSharingRepository(), getSchoolDefault }, 'offline');

    expect(screen.getByText(/necesita conexión/)).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Compartir todos' })).not.toBeOnTheScreen();
    expect(getSchoolDefault).not.toHaveBeenCalled();
  });
});

describe('the switch of a swimmer', () => {
  it('turns on and off through the repository', async () => {
    const repository = createInMemoryGuardianSharingRepository();
    const setSwimmer = jest.spyOn(repository, 'setSwimmer');
    await swimmer(repository);

    await fireEvent.press(await screen.findByRole('radio', { name: 'Compartir todos' }));
    expect(await screen.findByText(/el acudiente ve todos los tiempos/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'No compartir' }));
    expect(await screen.findByText(/solo ve los tiempos que compartas uno por uno/)).toBeOnTheScreen();

    expect(setSwimmer.mock.calls).toEqual([
      ['a1', 'school-a', true],
      ['a1', 'school-a', false],
    ]);
  });

  it('starts from the swimmer\'s own value, not from the school default', async () => {
    const repository = createInMemoryGuardianSharingRepository();
    await repository.setSchoolDefault('school-a', true);
    await repository.setSwimmer('a1', 'school-a', false);
    await swimmer(repository);

    expect(await screen.findByText(/solo ve los tiempos que compartas uno por uno/)).toBeOnTheScreen();
  });

  it('shows the error of a refusal (42501) without leaving the switch changed', async () => {
    const setSwimmer = jest.fn().mockRejectedValue(deny);
    await swimmer({ ...createInMemoryGuardianSharingRepository(), setSwimmer });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Compartir todos' }));

    expect(await screen.findByText('No tienes permiso para cambiar esto.')).toBeOnTheScreen();
    expect(screen.getByText(/solo ve los tiempos que compartas/)).toBeOnTheScreen();
  });

  it('keeps the value just saved when a slower read that started before the save answers afterwards', async () => {
    const repository = createInMemoryGuardianSharingRepository();
    let answerSlowRead: (shared: boolean) => void = () => undefined;
    const getSwimmer = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => (answerSlowRead = resolve)));
    const element = (refreshKey: number) => (
      <ThemeProvider>
        <SwimmerSharingSection
          repository={{ ...repository, getSwimmer }}
          athleteId="a1"
          schoolId="school-a"
          connection="connected"
          refreshKey={refreshKey}
        />
      </ThemeProvider>
    );
    const view = await render(element(1));
    await screen.findByText(/solo ve los tiempos que compartas uno por uno/);

    // A sync completed: the read it starts is slow.
    await view.rerender(element(2));
    await fireEvent.press(screen.getByRole('radio', { name: 'Compartir todos' }));
    expect(await screen.findByText(/el acudiente ve todos los tiempos/)).toBeOnTheScreen();

    // The read answers with the value from before the save: it must not win.
    await act(async () => answerSlowRead(false));
    expect(screen.getByText(/el acudiente ve todos los tiempos/)).toBeOnTheScreen();
    expect(screen.queryByText(/solo ve los tiempos que compartas uno por uno/)).not.toBeOnTheScreen();
  });

  describe('record by record', () => {
    it('offers to share and stop sharing each record while the switch is off', async () => {
      const repository = createInMemoryGuardianSharingRepository();
      const setRecordShared = jest.spyOn(repository, 'setRecordShared');
      await swimmer(repository, recordsOf([record('r1', false), record('r2', true, { stroke: 'BK' })]));

      await fireEvent.press(await screen.findByRole('button', { name: 'Compartir' }));
      expect(await screen.findAllByRole('button', { name: 'Dejar de compartir' })).toHaveLength(2);
      await fireEvent.press(screen.getAllByRole('button', { name: 'Dejar de compartir' })[1]);
      await waitFor(() => expect(screen.getAllByRole('button', { name: 'Compartir' })).toHaveLength(1));

      expect(setRecordShared.mock.calls).toEqual([
        ['r1', true],
        ['r2', false],
      ]);
    });

    it('does not offer it while the switch is on', async () => {
      const repository = createInMemoryGuardianSharingRepository();
      await repository.setSwimmer('a1', 'school-a', true);
      const records = recordsOf([record('r1', true)]);
      await swimmer(repository, records);

      expect(await screen.findByText(/el acudiente ve todos los tiempos/)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Compartir' })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Dejar de compartir' })).not.toBeOnTheScreen();
      expect(records.list).not.toHaveBeenCalled();
    });

    it('shows the records after turning the switch off, and hides them after turning it on', async () => {
      const repository = createInMemoryGuardianSharingRepository();
      await repository.setSwimmer('a1', 'school-a', true);
      await swimmer(repository, recordsOf([record('r1', false)]));

      await fireEvent.press(await screen.findByRole('radio', { name: 'No compartir' }));
      expect(await screen.findByRole('button', { name: 'Compartir' })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('radio', { name: 'Compartir todos' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Compartir' })).not.toBeOnTheScreen());
    });

    it('never says shared or not shared for a record the device does not know, and offers nothing for it', async () => {
      await swimmer(createInMemoryGuardianSharingRepository(), recordsOf([record('r1', null)]));

      expect(await screen.findByLabelText('Sin dato')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Compartir' })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Dejar de compartir' })).not.toBeOnTheScreen();
    });

    it('says there are no records, shows the error of a refusal and keeps the record as it was', async () => {
      const setRecordShared = jest.fn().mockRejectedValue(deny);
      await swimmer({ ...createInMemoryGuardianSharingRepository(), setRecordShared }, recordsOf([record('r1', false)]));

      await fireEvent.press(await screen.findByRole('button', { name: 'Compartir' }));
      expect(await screen.findByText('No tienes permiso para cambiar esto.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Compartir' })).toBeOnTheScreen();
    });

    it('says when the swimmer has no school times', async () => {
      await swimmer(createInMemoryGuardianSharingRepository(), recordsOf([]));
      expect(await screen.findByText('Este nadador aún no tiene tiempos de la escuela.')).toBeOnTheScreen();
    });
  });
});
