import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import {
  createInMemoryMeasurementRepository,
  createInMemorySessionSetupRepository,
  IndividualTimingFlow,
  InvalidMeasurementMetersError,
  type IndividualTimingFlowProps,
} from '..';

jest.mock('../../../core/sync', () => ({
  useRecordSyncStates: () => new Map(),
  retryFailedRecord: jest.fn(),
}));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
let mockId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockId}` }));

// Synthetic data only.
const roster = [
  { id: 'a1', shortName: 'Ana M.', initials: 'AM', color: 'athlete-1' as const, authorized: true },
  { id: 'a2', shortName: 'Ben A.', initials: 'BA', color: 'athlete-2' as const, authorized: false },
  { id: 'a3', shortName: 'Cleo O.', initials: 'CO', color: 'athlete-3' as const, authorized: true },
];

let clock: bigint;
const second = 1_000_000_000n;

const setup = async (over: Partial<IndividualTimingFlowProps> = {}) => {
  const measurements = createInMemoryMeasurementRepository();
  const onExit = jest.fn();
  clock = 10n * second;
  const view = await render(
    <ThemeProvider>
      <IndividualTimingFlow
        subtitle="Escuela Delfines"
        schoolId="school-1"
        loadRoster={async () => roster}
        measurements={measurements}
        userId="coach-1"
        deviceId="device-1"
        now={() => clock}
        onExit={onExit}
        {...over}
      />
    </ThemeProvider>,
  );
  return { measurements, onExit, view };
};

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

// Times one athlete: starts the clock, lets `seconds` pass, stops and saves.
async function timeAthlete(seconds: bigint) {
  await press('Iniciar');
  clock += seconds * second;
  await press('Detener');
  await press('Guardar');
}

describe('individual timing flow', () => {
  it('lists the roster and says who will be skipped for lack of authorization', async () => {
    await setup();

    expect(await screen.findByText('Nadadores (2 de 3)')).toBeOnTheScreen();
    expect(screen.getByText('Falta autorización — se omitirá', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('leaves the flow from the setup back button', async () => {
    const { onExit } = await setup();
    await screen.findByText('Nadadores (2 de 3)');

    await press('Volver');

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('times the authorized athletes one after another and skips the one without authorization', async () => {
    const { measurements } = await setup();
    await screen.findByText('Nadadores (2 de 3)');
    await press('Empezar toma');

    expect(await screen.findByText('Ana M. · 1 de 2')).toBeOnTheScreen();
    await timeAthlete(35n);

    expect(await screen.findByText('Cleo O. · 2 de 2')).toBeOnTheScreen();
    await timeAthlete(40n);

    expect(await screen.findByText('Resumen de la toma')).toBeOnTheScreen();
    expect(screen.getByText('2 tiempos guardados.')).toBeOnTheScreen();
    expect(await measurements.listByAthleteEvent('a2', { stroke: 'FR', distance: '50m', pool: 'SCM' })).toEqual([]);
  });

  it('opens the picker from "Elegir", shows the chosen count and times only the chosen athletes in the chosen order', async () => {
    await setup();
    await screen.findByText('Nadadores (2 de 3)');

    await press('Elegir');
    // Ben A. has no authorization, so he cannot be chosen. Clearing Ana and choosing her again moves her to the end.
    expect(screen.queryByRole('button', { name: /^Ben A\./ })).toBeNull();
    await press('1 · Ana M.');
    await press('Ana M.');
    await press('Listo');

    expect(await screen.findByText('Nadadores (2 de 3)')).toBeOnTheScreen();
    await press('Empezar toma');
    expect(await screen.findByText('Cleo O. · 1 de 2')).toBeOnTheScreen();
    await timeAthlete(40n);
    expect(await screen.findByText('Ana M. · 2 de 2')).toBeOnTheScreen();
  });

  it('times a single chosen athlete and leaves out the one that was cleared', async () => {
    const { measurements } = await setup();
    await screen.findByText('Nadadores (2 de 3)');

    await press('Elegir');
    await press('2 · Cleo O.');
    await press('Listo');

    expect(await screen.findByText('Nadadores (1 de 3)')).toBeOnTheScreen();
    await press('Empezar toma');
    expect(await screen.findByText('Ana M. · 1 de 1')).toBeOnTheScreen();
    await timeAthlete(35n);
    expect(await screen.findByText('1 tiempo guardado.')).toBeOnTheScreen();
    expect(await measurements.listByAthleteEvent('a3', { stroke: 'FR', distance: '50m', pool: 'SCM' })).toEqual([]);
  });

  it('restores the event, the type and the chosen athletes when the flow is opened again', async () => {
    const setups = createInMemorySessionSetupRepository();
    await setup({ setups });
    await screen.findByText('Nadadores (2 de 3)');
    await fireEvent.press(screen.getByRole('radio', { name: 'Espalda' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Competencia' }));
    await press('Elegir');
    await press('2 · Cleo O.');
    await press('Listo');
    await screen.unmount();

    await setup({ setups });

    expect(await screen.findByText('Nadadores (1 de 3)')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Espalda' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Competencia' })).toBeSelected();
  });

  it('keeps going when the setup cannot be read or saved, even with 128 athletes', async () => {
    const big = Array.from({ length: 128 }, (_, i) => ({ id: `a${i}`, shortName: `Nadador ${i}`, initials: 'N', color: 'athlete-1' as const, authorized: true }));
    const setups = { load: jest.fn().mockRejectedValue(new Error('unreadable')), save: jest.fn().mockRejectedValue(new Error('too big')) };
    await setup({ setups, loadRoster: async () => big });

    expect(await screen.findByText('Nadadores (128 de 128)')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Espalda' }));
    await press('Empezar toma');

    expect(setups.save).toHaveBeenCalled();
    expect(await screen.findByText('Nadador 0 · 1 de 128')).toBeOnTheScreen();
  });

  it('does not start when every athlete was cleared in the picker', async () => {
    await setup();
    await screen.findByText('Nadadores (2 de 3)');

    await press('Elegir');
    await press('1 · Ana M.');
    await press('1 · Cleo O.');
    await press('Listo');
    await press('Empezar toma');

    expect(screen.getByText('Nadadores (0 de 3)')).toBeOnTheScreen();
  });

  it('saves a training time as a repetition with the event, the author and the device', async () => {
    const { measurements } = await setup();
    await screen.findByText('Nadadores (2 de 3)');
    await press('Empezar toma');
    await screen.findByText('Ana M. · 1 de 2');
    await timeAthlete(35n);

    const [saved] = await measurements.listByAthleteEvent('a1', { stroke: 'FR', distance: '50m', pool: 'SCM' });

    expect(saved).toMatchObject({
      kind: 'repetition',
      hundredths: 3500,
      athleteId: 'a1',
      sessionType: 'training',
      source: 'screen_stopwatch',
      createdBy: 'coach-1',
      schoolId: 'school-1',
      deviceId: 'device-1',
      seriesId: null,
      parentId: null,
    });
  });

  it('saves a competition time as a race', async () => {
    const { measurements } = await setup();
    await screen.findByText('Nadadores (2 de 3)');
    await fireEvent.press(screen.getByRole('radio', { name: 'Competencia' }));
    await press('Empezar toma');
    await screen.findByText('Ana M. · 1 de 2');
    await timeAthlete(35n);

    const [saved] = await measurements.listByAthleteEvent('a1', { stroke: 'FR', distance: '50m', pool: 'SCM' });

    expect(saved).toMatchObject({ kind: 'race', sessionType: 'competition' });
  });

  it('saves the splits under the final time', async () => {
    const { measurements } = await setup();
    await screen.findByText('Nadadores (2 de 3)');
    await press('Empezar toma');
    await screen.findByText('Ana M. · 1 de 2');
    await press('Iniciar');
    clock += 17n * second;
    await press('Parcial');
    clock += 18n * second;
    await press('Detener');
    await press('Guardar');

    const saved = await measurements.listByAthleteEvent('a1', { stroke: 'FR', distance: '50m', pool: 'SCM' });
    const final = saved.find((m) => m.kind === 'repetition');
    const split = saved.find((m) => m.kind === 'split');

    expect(split).toMatchObject({ hundredths: 1700, parentId: final?.id });
  });

  describe('free laps with meters', () => {
    const event = { stroke: 'FR', distance: '100m', pool: 'SCM' } as const;

    // A 100 m race in a 25 m pool, five marks and then the stop. The marks sit 10 s apart.
    async function swimFiveMarks() {
      const result = await setup();
      await screen.findByText('Nadadores (2 de 3)');
      await fireEvent.press(screen.getByRole('radio', { name: '100 m' }));
      await press('Empezar toma');
      await screen.findByText('Ana M. · 1 de 2');
      await press('Iniciar');
      for (let mark = 1; mark <= 5; mark++) {
        clock += 10n * second;
        await press('Parcial');
      }
      return result;
    }

    const splitsOf = async (measurements: ReturnType<typeof createInMemoryMeasurementRepository>) =>
      (await measurements.listByAthleteEvent('a1', event))
        .filter((m) => m.kind === 'split')
        .sort((a, b) => (a.hundredths ?? 0) - (b.hundredths ?? 0))
        .map((m) => m.meters ?? null);

    it('takes more marks than the event has laps and never stops by itself', async () => {
      await swimFiveMarks();

      expect(screen.getByRole('button', { name: 'Detener' })).toBeOnTheScreen();
      expect(screen.getByText(/^Parcial 5 · 50,00$/)).toBeOnTheScreen();
    });

    it('labels a mark with its meters, and one without meters only with its number', async () => {
      await swimFiveMarks();
      await press('Detener');

      expect(screen.getByText(/^Parcial 2 · 50 m · 20,00$/)).toBeOnTheScreen();
      expect(screen.getByText(/^Parcial 3 · 75 m · 30,00$/)).toBeOnTheScreen();
      // 4 x 25 m reaches the distance: no meters.
      expect(screen.getByText(/^Parcial 4 · 40,00$/)).toBeOnTheScreen();
      expect(screen.getByText(/^Parcial 5 · 50,00$/)).toBeOnTheScreen();
    });

    it('shows the pace and the projection of the stopped time with the meters of its marks', async () => {
      await swimFiveMarks();
      expect(screen.queryByText('Ritmo y proyección')).not.toBeOnTheScreen();
      await press('Detener');

      expect(screen.getByText('Ritmo y proyección')).toBeOnTheScreen();
      expect(screen.getByText('0–25 m · 10,00 · 40,00 / 100 m')).toBeOnTheScreen();
      expect(screen.getByText('75–100 m · 20,00 · 1:20,00 / 100 m')).toBeOnTheScreen();
      expect(screen.getByText('1.ª mitad 20,00 · 2.ª mitad 30,00 · +10,00')).toBeOnTheScreen();
      // 3 marks with meters: 30 s at 75 m, then 25 m at (30 - 10) s / 50 m.
      expect(screen.getByText('Si mantiene este ritmo: 40,00')).toBeOnTheScreen();
      expect(screen.getByText('Estimación optimista; la mayoría pierde ritmo al final')).toBeOnTheScreen();
    });

    it('shows no projection when only one mark has meters', async () => {
      await setup();
      await screen.findByText('Nadadores (2 de 3)');
      await fireEvent.press(screen.getByRole('radio', { name: '100 m' }));
      await press('Empezar toma');
      await screen.findByText('Ana M. · 1 de 2');
      await press('Iniciar');
      clock += 10n * second;
      await press('Parcial');
      clock += 20n * second;
      await press('Detener');

      expect(screen.getByText('Ritmo y proyección')).toBeOnTheScreen();
      expect(screen.queryByText(/Si mantiene este ritmo/)).not.toBeOnTheScreen();
    });

    it('saves the meters of the pool when the review is not opened', async () => {
      const { measurements } = await swimFiveMarks();
      await press('Detener');
      await press('Guardar');

      expect(await splitsOf(measurements)).toEqual([25, 50, 75, null, null]);
    });

    it('saves the meters that were corrected or completed in the review', async () => {
      const { measurements } = await swimFiveMarks();
      await press('Detener');
      await press('Revisar metros');
      await fireEvent.changeText(screen.getByLabelText(/^Metros hasta Parcial 2/), '40,5');
      await fireEvent.changeText(screen.getByLabelText(/^Metros hasta Parcial 4/), '90');
      await press('Listo');

      expect(await screen.findByText(/^Parcial 2 · 40,5 m · 20,00$/)).toBeOnTheScreen();
      expect(screen.getByText(/^Parcial 4 · 90 m · 40,00$/)).toBeOnTheScreen();
      await press('Guardar');

      expect(await splitsOf(measurements)).toEqual([25, 40.5, 75, 90, null]);
    });

    it.each([
      ['100', 'Los metros deben ser más de 0 y menos de 100 m.'],
      ['0', 'Los metros deben ser más de 0 y menos de 100 m.'],
      ['20', 'Los metros deben ir en aumento de un parcial al siguiente.'],
      ['mucho', 'Escribe los metros con números, por ejemplo 37,5.'],
    ])('does not accept %s as the meters of the second mark', async (text, message) => {
      await swimFiveMarks();
      await press('Detener');
      await press('Revisar metros');
      await fireEvent.changeText(screen.getByLabelText(/^Metros hasta Parcial 2/), text);
      await press('Listo');

      expect(await screen.findByText(message)).toBeOnTheScreen();
      expect(screen.getByText('Metros de los parciales')).toBeOnTheScreen();
    });

    it('sends the person back to the review with the reason when the meters are refused on saving', async () => {
      const inner = createInMemoryMeasurementRepository();
      const refusing = {
        ...inner,
        add: async (m: Parameters<typeof inner.add>[0]) => {
          if (m.kind === 'split') throw new InvalidMeasurementMetersError('Meters must be above 0 and below 100000');
          return inner.add(m);
        },
      };
      await setup({ measurements: refusing });
      await screen.findByText('Nadadores (2 de 3)');
      await fireEvent.press(screen.getByRole('radio', { name: '100 m' }));
      await press('Empezar toma');
      await screen.findByText('Ana M. · 1 de 2');
      await press('Iniciar');
      clock += 10n * second;
      await press('Parcial');
      clock += 10n * second;
      await press('Detener');
      await press('Guardar');

      expect(await screen.findByText('No pudimos guardar los metros. Revísalos e inténtalo de nuevo.')).toBeOnTheScreen();
      expect(screen.getByText('Metros de los parciales')).toBeOnTheScreen();
    });

    it('keeps the stopped time and the pool meters when the review is left with back', async () => {
      const { measurements } = await swimFiveMarks();
      await press('Detener');
      await press('Revisar metros');
      await fireEvent.changeText(screen.getByLabelText(/^Metros hasta Parcial 2/), '40');
      await press('Volver');
      await press('Guardar');

      expect(await splitsOf(measurements)).toEqual([25, 50, 75, null, null]);
    });

    it('offers no review when there are no marks, and does not carry the meters to the next athlete', async () => {
      const { measurements } = await swimFiveMarks();
      await press('Detener');
      await press('Revisar metros');
      await fireEvent.changeText(screen.getByLabelText(/^Metros hasta Parcial 2/), '40');
      await press('Listo');
      await press('Guardar');
      await screen.findByText('Cleo O. · 2 de 2');
      await press('Iniciar');
      clock += 10n * second;
      await press('Parcial');
      await press('Detener');

      expect(screen.getByText(/^Parcial 1 · 25 m · 10,00$/)).toBeOnTheScreen();
      expect(await measurements.listByAthleteEvent('a3', event)).toEqual([]);
      await press('Descartar');
      await press('Iniciar');
      await press('Detener');
      expect(screen.queryByRole('button', { name: 'Revisar metros' })).toBeNull();
    });
  });

  it('saves nothing when the stopped time is discarded', async () => {
    const { measurements } = await setup();
    await screen.findByText('Nadadores (2 de 3)');
    await press('Empezar toma');
    await screen.findByText('Ana M. · 1 de 2');
    await press('Iniciar');
    clock += 35n * second;
    await press('Detener');
    await press('Descartar');

    expect(await measurements.listByAthleteEvent('a1', { stroke: 'FR', distance: '50m', pool: 'SCM' })).toEqual([]);
    expect(screen.getByText('Ana M. · 1 de 2')).toBeOnTheScreen();
  });

  describe('personal best', () => {
    const event = { stroke: 'FR', distance: '50m', pool: 'SCM' };
    const hidden = { includeHiddenElements: true };
    const startTiming = async (over: Partial<IndividualTimingFlowProps>) => {
      await setup(over);
      await screen.findByText('Nadadores (2 de 3)');
      await press('Empezar toma');
      await screen.findByText('Ana M. · 1 de 2');
    };

    it('shows the best of the athlete in the event and the difference once the time is stopped', async () => {
      const loadBestTime = jest.fn(async (id: string) => (id === 'a1' ? 3482 : null));
      await startTiming({ loadBestTime });
      await press('Iniciar');
      clock += 3391n * (second / 100n);
      await press('Detener');

      expect(await screen.findByText('MP 34,82')).toBeOnTheScreen();
      expect(screen.getByText('−0,91 vs MP', hidden)).toBeOnTheScreen();
      expect(loadBestTime).toHaveBeenCalledWith('a1', event);
    });

    it('reads the best of the next athlete too, and omits the difference when there is none', async () => {
      const loadBestTime = jest.fn(async (id: string) => (id === 'a1' ? 3482 : null));
      await startTiming({ loadBestTime });
      await timeAthlete(35n);
      await screen.findByText('Cleo O. · 2 de 2');
      await press('Iniciar');
      clock += 35n * second;
      await press('Detener');

      expect(loadBestTime).toHaveBeenCalledWith('a3', event);
      expect(await screen.findByText('MP —')).toBeOnTheScreen();
      expect(screen.queryByText(/vs MP/, hidden)).toBeNull();
    });

    it('keeps timing with no difference when the best cannot be read', async () => {
      await startTiming({ loadBestTime: jest.fn().mockRejectedValue(new Error('unreadable')) });
      await timeAthlete(35n);

      expect(await screen.findByText('Cleo O. · 2 de 2')).toBeOnTheScreen();
    });
  });

  it('takes the mark at the touch, however late the screen renders', async () => {
    const { measurements } = await setup();
    await screen.findByText('Nadadores (2 de 3)');
    await press('Empezar toma');
    await screen.findByText('Ana M. · 1 de 2');
    await press('Iniciar');
    clock += 17n * second;
    // Both touches happen before React renders: the clock moves on while the updates wait.
    const split = screen.getByRole('button', { name: 'Parcial' });
    const stop = screen.getByRole('button', { name: 'Detener' });
    await act(async () => {
      fireEvent.press(split);
      clock += 18n * second;
      fireEvent.press(stop);
      clock += 5n * second;
    });
    await press('Guardar');

    const saved = await measurements.listByAthleteEvent('a1', { stroke: 'FR', distance: '50m', pool: 'SCM' });
    expect(saved.map((m) => [m.kind, m.hundredths]).sort()).toEqual([['repetition', 3500], ['split', 1700]]);
  });

  it('asks before leaving while a time is running, and goes back to the setup when confirmed', async () => {
    await setup();
    await screen.findByText('Nadadores (2 de 3)');
    await press('Empezar toma');
    await screen.findByText('Ana M. · 1 de 2');
    await press('Iniciar');

    await press('Volver');
    expect(await screen.findByText('¿Descartar este tiempo?')).toBeOnTheScreen();
    await press('Descartar tiempo');

    expect(await screen.findByText('Nadadores (2 de 3)')).toBeOnTheScreen();
  });

  it('leaves the flow when the summary is finished', async () => {
    const { onExit } = await setup();
    await screen.findByText('Nadadores (2 de 3)');
    await press('Empezar toma');
    await screen.findByText('Ana M. · 1 de 2');
    await timeAthlete(35n);
    await screen.findByText('Cleo O. · 2 de 2');
    await timeAthlete(40n);

    await press('Terminar');

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  describe('correcting a saved time', () => {
    const event = { stroke: 'FR', distance: '50m', pool: 'SCM' } as const;

    // Times both athletes (35 s and 40 s) and opens the correction of Cleo's time from the summary.
    async function openCorrection() {
      const view = await setup();
      await screen.findByText('Nadadores (2 de 3)');
      await press('Empezar toma');
      await screen.findByText('Ana M. · 1 de 2');
      await timeAthlete(35n);
      await screen.findByText('Cleo O. · 2 de 2');
      await timeAthlete(40n);
      await screen.findByText('Resumen de la toma');
      await press('Corregir un tiempo');
      await press('Cleo O., Tiempo 40,00');
      return view;
    }

    it('saves the corrected time with edit and shows it in the summary', async () => {
      const { measurements } = await openCorrection();
      const edit = jest.spyOn(measurements, 'edit');

      expect(await screen.findByLabelText('Nuevo tiempo')).toHaveDisplayValue('40,00');
      await fireEvent.changeText(screen.getByLabelText('Nuevo tiempo'), '39,50');
      await press('Guardar corrección');

      expect(await screen.findByText('Resumen de la toma')).toBeOnTheScreen();
      expect(screen.getByLabelText('Cleo O., Tiempo 39,50')).toBeOnTheScreen();
      expect(edit).toHaveBeenCalledWith(expect.any(String), { hundredths: 3950 }, { deviceId: 'device-1' });
      const [cleo] = await measurements.listByAthleteEvent('a3', event);
      expect(cleo).toMatchObject({ hundredths: 3950 });
    });

    it('turns an emptied field into a missing time, not zero', async () => {
      const { measurements } = await openCorrection();

      await fireEvent.changeText(await screen.findByLabelText('Nuevo tiempo'), '');
      await press('Guardar corrección');

      expect(await screen.findByText('Resumen de la toma')).toBeOnTheScreen();
      expect(screen.getByLabelText('Cleo O., Tiempo sin registrar')).toBeOnTheScreen();
      const [cleo] = await measurements.listByAthleteEvent('a3', event);
      expect(cleo).toMatchObject({ hundredths: null });
    });

    it('shows the repository refusal of a zero time and keeps the saved time', async () => {
      const { measurements } = await openCorrection();

      await fireEvent.changeText(await screen.findByLabelText('Nuevo tiempo'), '0,00');
      await press('Guardar corrección');

      expect(await screen.findByText('El tiempo debe ser mayor que cero.')).toBeOnTheScreen();
      const [cleo] = await measurements.listByAthleteEvent('a3', event);
      expect(cleo).toMatchObject({ hundredths: 4000 });
    });

    it('goes back to the summary without saving', async () => {
      const { measurements } = await openCorrection();
      const edit = jest.spyOn(measurements, 'edit');

      await press('Volver');

      expect(await screen.findByText('Resumen de la toma')).toBeOnTheScreen();
      expect(edit).not.toHaveBeenCalled();
    });
  });

  it('marks an athlete as skipped when a withdrawal reaches the device with the setup open', async () => {
    const { view } = await setup();
    await screen.findByText('Nadadores (2 de 3)');

    const withdrawn = roster.map((a) => (a.id === 'a1' ? { ...a, authorized: false } : a));
    await view.rerender(
      <ThemeProvider>
        <IndividualTimingFlow
          schoolId="school-1"
          subtitle="Escuela Delfines"
          loadRoster={async () => withdrawn}
          measurements={createInMemoryMeasurementRepository()}
          userId="coach-1"
          deviceId="device-1"
          now={() => clock}
          onExit={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(await screen.findByText('Nadadores (1 de 3)')).toBeOnTheScreen();
  });

  it('keeps the roster in use when the reload after a sync fails', async () => {
    const { view } = await setup();
    await screen.findByText('Nadadores (2 de 3)');

    await view.rerender(
      <ThemeProvider>
        <IndividualTimingFlow
          schoolId="school-1"
          subtitle="Escuela Delfines"
          loadRoster={async () => {
            throw new Error('offline');
          }}
          measurements={createInMemoryMeasurementRepository()}
          userId="coach-1"
          deviceId="device-1"
          now={() => clock}
          onExit={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(await screen.findByText('Nadadores (2 de 3)')).toBeOnTheScreen();
  });

  it('does not start when nobody is authorized', async () => {
    await setup({ loadRoster: async () => [roster[1]!] });
    await screen.findByText('Nadadores (0 de 1)');

    await press('Empezar toma');

    expect(screen.getByText('Nadadores (0 de 1)')).toBeOnTheScreen();
  });
});
