import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryAthleteSchoolRepository, createInMemoryHistoryRepository, type HistoryMeasurement } from '../../athletes';
import { createInMemorySchoolNameRepository } from '../../school-console';
import { createInMemoryAssignmentRepository, createInMemoryTrainingPlanRepository, HomeContainer, type HomeContainerProps } from '..';
import { athletes as schoolAthletes, plan } from '../__fixtures__/assignments';

// The barrels pull in the native PowerSync database; these tests use the in-memory repositories only.
jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Monday 2 November 2026: its week runs from the 2nd to the 8th.
const DAY = '2026-11-02';
const schoolLinks = createInMemoryAthleteSchoolRepository([
  { athleteId: 'a1', schoolId: 's1', categoryId: 'c1' },
  { athleteId: 'a3', schoolId: 's1', categoryId: 'c2' },
]);

const measurement = (m: Partial<HistoryMeasurement> & Pick<HistoryMeasurement, 'id' | 'athleteId' | 'capturedAt'>): HistoryMeasurement =>
  ({
    seriesId: null,
    arrivalPosition: null,
    stroke: 'FR',
    distance: '50m',
    pool: 'SCM',
    sessionType: 'training',
    source: 'screen_stopwatch',
    createdBy: 'k1',
    schoolId: 's1',
    deviceId: 'd1',
    parentId: null,
    version: 1,
    editedBy: null,
    editedAt: null,
    editReason: null,
    kind: 'race',
    hundredths: 3482,
    origin: 'own',
    ...m,
  }) as HistoryMeasurement;

type SetupOptions = {
  ids?: string[];
  // Days with an assignment: plan p1 (group g1, athlete a1) and plan p2 (group g2, athlete a3).
  p1Days?: string[];
  p2Days?: string[];
  marks?: HistoryMeasurement[];
  synced?: boolean;
  greetingName?: string;
  failHistory?: boolean;
};

async function setup({ ids = ['a1'], p1Days = [DAY], p2Days = [], marks = [], synced, greetingName, failHistory }: SetupOptions = {}) {
  const plans = createInMemoryTrainingPlanRepository();
  await plans.save({ ...plan('p1'), name: 'Toma de tiempos' });
  await plans.save({ ...plan('p2'), name: 'Plan del otro' });
  const assignments = createInMemoryAssignmentRepository(plans);
  for (const sessionDate of p1Days) await assignments.create({ planId: 'p1', schoolId: 's1', sessionDate, target: { kind: 'group', groupId: 'g1' } });
  for (const sessionDate of p2Days) await assignments.create({ planId: 'p2', schoolId: 's1', sessionDate, target: { kind: 'group', groupId: 'g2' } });
  const history = createInMemoryHistoryRepository(marks);
  const props: HomeContainerProps = {
    plans,
    assignments,
    schoolLinks,
    history: failHistory ? { listByAthlete: jest.fn().mockRejectedValueOnce(new Error('local read failed')).mockImplementation(history.listByAthlete) } : history,
    schoolNames: createInMemorySchoolNameRepository([{ id: 's1', name: 'Escuela de ejemplo' }]),
    athletes: (await schoolAthletes.listBySchool('s1')).filter((a) => ids.includes(a.id)),
    greetingName,
    syncState: 'synced',
    day: DAY,
    synced,
    onOpenToday: jest.fn(),
  };
  return props;
}

async function show(options?: SetupOptions) {
  const props = await setup(options);
  await render(<HomeContainer {...props} />);
  // The reads of the local database settle.
  await act(async () => {});
  return props;
}

describe('HomeContainer', () => {
  it('greets by name, names the school and marks today in the week', async () => {
    await show({ greetingName: 'Paula' });

    expect(screen.getByText('Hola, Paula')).toBeOnTheScreen();
    expect(screen.getByText('Escuela de ejemplo')).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/^(Lun|Mar|Mié|Jue|Vie|Sáb|Dom) \d+$/)).toHaveLength(7);
    expect(screen.getByLabelText('Lun 2')).toBeSelected();
    expect(screen.getByLabelText('Mar 3')).not.toBeSelected();
    expect(screen.getByLabelText('Dom 8')).toBeOnTheScreen();
  });

  it('greets without a name when the device has none', async () => {
    await show({ greetingName: '  ' });

    expect(screen.getByText('Hola')).toBeOnTheScreen();
  });

  it('shows the sync state of the device', async () => {
    await show();

    expect(screen.getByLabelText('Enviado')).toBeOnTheScreen();
  });

  describe('Lo próximo', () => {
    it('shows the plan of today with the day, and opens it for that athlete', async () => {
      const { onOpenToday } = await show();

      expect(screen.getByText('Lo próximo')).toBeOnTheScreen();
      expect(screen.getByText('Toma de tiempos')).toBeOnTheScreen();
      expect(screen.getByLabelText('Hoy')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Ver entreno' }));

      expect(onOpenToday).toHaveBeenCalledWith('a1');
    });

    it('says Mañana for the next day and a short date after that', async () => {
      await show({ p1Days: ['2026-11-03'] });
      expect(screen.getByLabelText('Mañana')).toBeOnTheScreen();
    });

    it('looks for the next assignment among the following days', async () => {
      await show({ p1Days: ['2026-11-06'] });
      expect(screen.getByLabelText(/vie,? 6 (de )?nov/i)).toBeOnTheScreen();
    });

    it('is left out when no assignment is coming', async () => {
      await show({ p1Days: [] });

      expect(screen.queryByText('Lo próximo')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Ver entreno' })).toBeNull();
    });

    it('does not offer a plan of a past day', async () => {
      await show({ p1Days: ['2026-11-01'] });

      expect(screen.queryByText('Lo próximo')).toBeNull();
    });
  });

  describe('several athletes', () => {
    it('picks the soonest assignment for Todos and the athlete own plan for each chip', async () => {
      await show({ ids: ['a1', 'a3'], p1Days: ['2026-11-05'], p2Days: ['2026-11-03'] });

      expect(screen.getByRole('radio', { name: /Todos/ })).toBeSelected();
      expect(screen.getByText('Plan del otro')).toBeOnTheScreen();
      expect(screen.getByLabelText('Mañana')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('radio', { name: /^A1/ }));
      expect(screen.getByText('Toma de tiempos')).toBeOnTheScreen();
    });

    it('shows Todos and one chip per athlete when there are several', async () => {
      await show({ ids: ['a1', 'a3'] });

      expect(screen.getAllByRole('radio')).toHaveLength(3);
      expect(screen.getByRole('radio', { name: /Todos/ })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: /^A1/ })).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: /^A3/ })).toBeOnTheScreen();
    });

    it('shows no chips for a single athlete', async () => {
      await show();

      expect(screen.queryByRole('radiogroup')).toBeNull();
    });
  });

  describe('Esta semana', () => {
    const inWeek = measurement({ id: 'm1', athleteId: 'a1', capturedAt: '2026-11-04T15:00:00' });

    it('lists the marks of the week, newest first, with the event, the day and the kind of session', async () => {
      await show({
        marks: [
          inWeek,
          measurement({ id: 'm2', athleteId: 'a1', capturedAt: '2026-11-05T15:00:00', stroke: 'BK', distance: '100m', sessionType: 'competition', hundredths: 8915 }),
        ],
      });

      expect(screen.getByText('Esta semana')).toBeOnTheScreen();
      const rows = screen.getAllByText(/ · (Libre 50 m|Espalda 100 m)$/);
      expect(rows.map((row) => row.props.children)).toEqual([expect.stringContaining('Espalda 100 m'), expect.stringContaining('Libre 50 m')]);
      expect(screen.getByText('Jueves · Competencia')).toBeOnTheScreen();
      expect(screen.getByText('Miércoles · Entrenamiento')).toBeOnTheScreen();
    });

    it('never says new marks or labels one as a personal best', async () => {
      await show({ marks: [inWeek] });

      expect(screen.queryByText(/nuevas/i)).toBeNull();
      expect(screen.queryByText('MP')).toBeNull();
    });

    it('leaves out other weeks, splits and times that are missing', async () => {
      await show({
        marks: [
          measurement({ id: 'old', athleteId: 'a1', capturedAt: '2026-10-30T15:00:00' }),
          measurement({ id: 'next', athleteId: 'a1', capturedAt: '2026-11-09T09:00:00' }),
          measurement({ id: 'split', athleteId: 'a1', capturedAt: '2026-11-04T15:01:00', kind: 'split' }),
          measurement({ id: 'none', athleteId: 'a1', capturedAt: '2026-11-04T15:02:00', hundredths: null }),
        ],
      });

      expect(screen.queryByText('Esta semana')).toBeNull();
    });

    it('shows only the athlete of the chip', async () => {
      await show({ ids: ['a1', 'a3'], marks: [inWeek, measurement({ id: 'm3', athleteId: 'a3', capturedAt: '2026-11-04T16:00:00', stroke: 'BR' })] });
      expect(screen.getAllByText(/ · (Libre|Pecho) 50 m$/)).toHaveLength(2);

      await fireEvent.press(screen.getByRole('radio', { name: /^A3/ }));

      expect(screen.getAllByText(/ · (Libre|Pecho) 50 m$/)).toHaveLength(1);
      expect(screen.getByText(/ · Pecho 50 m$/)).toBeOnTheScreen();
    });
  });

  it('says there is nothing to show when there is no plan and no mark', async () => {
    await show({ p1Days: [] });

    expect(screen.getByText('Todavía no hay nada para mostrar')).toBeOnTheScreen();
  });

  it('shows loading before the first sync, and nothing is read yet', async () => {
    await show({ synced: false });

    expect(screen.getByTestId('state-view')).toBeOnTheScreen();
    expect(screen.queryByText('Lo próximo')).toBeNull();
  });

  it('offers a retry when the local read fails', async () => {
    await show({ failHistory: true });
    expect(screen.getByText('No pudimos cargar el inicio')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    await act(async () => {});

    expect(screen.getByText('Lo próximo')).toBeOnTheScreen();
  });
});
