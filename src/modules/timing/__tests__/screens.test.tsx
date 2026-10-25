import { fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler, Text } from 'react-native';

import { TimingHeader } from '../components/TimingHeader';
import { StopwatchScreen } from '../screens/StopwatchScreen';
import { TimingSummaryScreen } from '../screens/TimingSummaryScreen';
import { TimingSetupScreen } from '../screens/TimingSetupScreen';
import { fixture } from '../__fixtures__/timing';

// The jest environment has no hardware back: capture the handler the screen registers and press it by hand.
let backHandlers: (() => boolean | null | undefined)[] = [];
beforeEach(() => {
  backHandlers = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandlers.push(handler as () => boolean | null | undefined);
    return { remove: () => (backHandlers = backHandlers.filter((h) => h !== (handler as unknown))) };
  });
});
afterEach(() => jest.restoreAllMocks());
const pressHardwareBack = () => [...backHandlers].reverse().some((handler) => handler());

describe('TimingHeader', () => {
  it('shows title, subtitle and trailing slot, with a back button of at least 48 dp', async () => {
    const onBack = jest.fn();
    await render(<TimingHeader title="Toma de tiempos" subtitle="Grupo B · Martes 7:00" onBack={onBack} trailing={<Text>3</Text>} />);

    expect(screen.getByRole('header', { name: 'Toma de tiempos' })).toBeOnTheScreen();
    expect(screen.getByText('Grupo B · Martes 7:00')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
    const back = screen.getByRole('button', { name: 'Volver' });
    await fireEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('works without subtitle or trailing slot', async () => {
    await render(<TimingHeader title="Toma de tiempos" onBack={jest.fn()} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

function renderStopwatchScreen(props: Partial<Parameters<typeof StopwatchScreen>[0]> = {}) {
  const callbacks = {
    onBack: jest.fn(),
    onConfirmExit: jest.fn(),
    onCancelExit: jest.fn(),
    onStart: jest.fn(),
    onSplit: jest.fn(),
    onStop: jest.fn(),
    onSave: jest.fn(),
    onDiscard: jest.fn(),
  };
  return render(<StopwatchScreen {...fixture.stopwatchScreen} {...callbacks} exitConfirmVisible={false} {...props} />).then(
    () => callbacks,
  );
}

describe('StopwatchScreen', () => {
  it('titles the athlete with the position and shows the event', async () => {
    await renderStopwatchScreen({ state: 'ready' });

    expect(screen.getByRole('header', { name: 'Mateo C. · 1 de 4' })).toBeOnTheScreen();
    expect(screen.getByText('Libre 50 m · Entrenamiento')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeOnTheScreen();
  });

  it.each([
    ['running', 'Detener'],
    ['stopped', 'Guardar'],
  ] as const)('renders the %s state', async (state, button) => {
    await renderStopwatchScreen({ state, elapsedHundredths: 3391, bestTime: 3482 });

    expect(screen.getByRole('button', { name: button })).toBeOnTheScreen();
  });

  it('calls onBack from the header back button', async () => {
    const { onBack } = await renderStopwatchScreen({ state: 'running', elapsedHundredths: 3391 });

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('hands the Android back button to onBack only while running', async () => {
    const running = await renderStopwatchScreen({ state: 'running', elapsedHundredths: 3391 });
    expect(pressHardwareBack()).toBe(true);
    expect(running.onBack).toHaveBeenCalledTimes(1);
  });

  it.each(['ready', 'stopped'] as const)('leaves the Android back button alone when %s', async (state) => {
    const { onBack } = await renderStopwatchScreen({ state, elapsedHundredths: 3391 });
    expect(pressHardwareBack()).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('shows no exit sheet unless the container asks for it', async () => {
    await renderStopwatchScreen({ state: 'running', elapsedHundredths: 3391 });

    expect(screen.queryByText('¿Descartar este tiempo?')).toBeNull();
  });

  it('shows the exit sheet naming the athlete and routes both choices to the container', async () => {
    const { onConfirmExit, onCancelExit } = await renderStopwatchScreen({
      state: 'running',
      elapsedHundredths: 3391,
      exitConfirmVisible: true,
    });

    expect(screen.getByText('¿Descartar este tiempo?')).toBeOnTheScreen();
    expect(screen.getByText('El tiempo en marcha de Mateo C. no se guardará. No se puede recuperar.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Descartar tiempo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Seguir midiendo' }));
    expect(onConfirmExit).toHaveBeenCalledTimes(1);
    expect(onCancelExit).toHaveBeenCalledTimes(1);
  });
});

function renderSetup(props: Partial<Parameters<typeof TimingSetupScreen>[0]> = {}) {
  const callbacks = {
    onBack: jest.fn(),
    onStart: jest.fn(),
    onStrokeChange: jest.fn(),
    onDistanceChange: jest.fn(),
    onPoolChange: jest.fn(),
    onSessionTypeChange: jest.fn(),
    onSourceChange: jest.fn(),
    onChooseAthletes: jest.fn(),
  };
  return render(<TimingSetupScreen {...fixture.setupScreen} {...callbacks} {...props} />).then(() => callbacks);
}

describe('TimingSetupScreen', () => {
  it('asks what to measure with one selector per field, each with its current value', async () => {
    await renderSetup();

    expect(screen.getByRole('header', { name: 'Toma de tiempos' })).toBeOnTheScreen();
    expect(screen.getByText('Grupo B · Martes 7:00')).toBeOnTheScreen();
    expect(screen.getByText('¿Qué vas a medir?')).toBeOnTheScreen();
    const groups = screen.container.queryAll((node) => node.props.accessibilityRole === 'radiogroup');
    expect(groups.map((group) => group.props.accessibilityLabel)).toEqual([
      'Estilo',
      'Distancia',
      'Piscina',
      'Tipo de sesión',
      'Fuente del tiempo',
    ]);
    expect(screen.getByRole('radio', { name: 'Libre' })).toBeSelected();
    expect(screen.getByRole('radio', { name: '50 m' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Entrenamiento' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Este teléfono' })).toBeSelected();
  });

  it('reports every change by field', async () => {
    const cb = await renderSetup();

    await fireEvent.press(screen.getByRole('radio', { name: 'Espalda' }));
    await fireEvent.press(screen.getByRole('radio', { name: '100 m' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Piscina de 50 m' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Competencia' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Cronómetro externo' }));

    expect(cb.onStrokeChange).toHaveBeenCalledWith('BK');
    expect(cb.onDistanceChange).toHaveBeenCalledWith('100m');
    expect(cb.onPoolChange).toHaveBeenCalledWith('LCM');
    expect(cb.onSessionTypeChange).toHaveBeenCalledWith('competition');
    expect(cb.onSourceChange).toHaveBeenCalledWith('external');
  });

  it('starts the session and goes back', async () => {
    const { onStart, onBack } = await renderSetup();

    await fireEvent.press(screen.getByRole('button', { name: 'Empezar toma' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('lists the athletes in order with their personal best, between the selectors and the start button', async () => {
    await renderSetup();

    expect(screen.getByText('Nadadores (3 de 12)')).toBeOnTheScreen();
    expect(screen.getByLabelText('1 · Mateo C., marca personal 34,82, MP')).toBeOnTheScreen();
    expect(screen.getByLabelText('2 · Lucía R., marca personal 34,82, MP')).toBeOnTheScreen();
    expect(screen.getByLabelText('3 · Sara P., sin marca personal, MP')).toBeOnTheScreen();
    const tree = JSON.stringify(screen.toJSON());
    const at = (text: string) => tree.indexOf(text);
    expect(at('Cronómetro externo')).toBeLessThan(at('Nadadores (3 de 12)'));
    expect(at('Nadadores (3 de 12)')).toBeLessThan(at('1 · Mateo C.'));
    expect(at('3 · Sara P.')).toBeLessThan(at('Empezar toma'));
  });

  it('marks and announces an athlete without authorization as skipped', async () => {
    await renderSetup({ athletes: fixture.athletesWithSkipped });

    expect(screen.getByLabelText(/3 · Sara P\..*Falta autorización — se omitirá/)).toBeOnTheScreen();
    expect(screen.getAllByText('Falta autorización — se omitirá', { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.getByLabelText('1 · Mateo C., marca personal 34,82, MP')).toBeOnTheScreen();
  });

  it('invites to choose athletes when there are none, without a second action', async () => {
    await renderSetup({ athletes: [], selectedCount: 0 });

    expect(screen.getByText('Aún no hay nadadores')).toBeOnTheScreen();
    expect(screen.getByText('Nadadores (0 de 12)')).toBeOnTheScreen();
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Volver', 'Elegir', 'Empezar toma']);
  });

  it('asks the container to choose athletes', async () => {
    const { onChooseAthletes } = await renderSetup();

    await fireEvent.press(screen.getByRole('button', { name: 'Elegir' }));
    expect(onChooseAthletes).toHaveBeenCalledTimes(1);
  });

  it('shows no athlete rows or count control issues: start and back stay available', async () => {
    const { onStart } = await renderSetup({ athletes: [] });

    await fireEvent.press(screen.getByRole('button', { name: 'Empezar toma' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe('TimingSummaryScreen', () => {
  function renderSummary(props: Partial<Parameters<typeof TimingSummaryScreen>[0]> = {}) {
    const callbacks = {
      onBack: jest.fn(),
      onRetry: jest.fn(),
      onRetryLoad: jest.fn(),
      onCorrect: jest.fn(),
      onFinish: jest.fn(),
    };
    return render(<TimingSummaryScreen {...fixture.summaryScreen} status="ready" {...callbacks} {...props} />).then(
      () => callbacks,
    );
  }

  it('lists every record with its time and sync pill, a missing time as a dash', async () => {
    await renderSummary();

    expect(screen.getByRole('header', { name: 'Resumen de la toma' })).toBeOnTheScreen();
    expect(screen.getByText('Grupo B · Libre 50 m')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mateo C., marca personal 33,91')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sara P., sin marca personal')).toBeOnTheScreen();
    for (const label of ['En el teléfono', 'No enviado', 'Enviado', 'Enviando']) {
      expect(screen.getByLabelText(label)).toBeOnTheScreen();
    }
    expect(screen.getAllByText('—', { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.queryByText(/0,00/, { includeHiddenElements: true })).toBeNull();
  });

  it('retries one record by id', async () => {
    const { onRetry } = await renderSummary();

    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(onRetry).toHaveBeenCalledWith('r2');
  });

  it('offers correct and finish', async () => {
    const { onCorrect, onFinish } = await renderSummary();

    await fireEvent.press(screen.getByRole('button', { name: 'Corregir un tiempo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Terminar' }));
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('draws the banner slot only when given', async () => {
    await renderSummary({ banner: <Text>BANNER</Text> });
    expect(screen.getByText('BANNER')).toBeOnTheScreen();
  });

  it('shows the empty state without records', async () => {
    await renderSummary({ records: [] });

    expect(screen.getByText('Sin tiempos guardados')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Corregir un tiempo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Terminar' })).toBeOnTheScreen();
  });

  it('shows the loading state without list or actions', async () => {
    await renderSummary({ status: 'loading' });

    expect(screen.getByTestId('state-view')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Terminar' })).toBeNull();
    expect(screen.queryByLabelText('Mateo C., marca personal 33,91')).toBeNull();
  });

  it('shows the error state and retries the load', async () => {
    const { onRetryLoad } = await renderSummary({ status: 'error' });

    expect(screen.getByText('No pudimos cargar el resumen')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(onRetryLoad).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Terminar' })).toBeNull();
  });
});

describe('StopwatchScreen extras', () => {
  it('draws the banner slot and the sync pill of the record when given', async () => {
    await renderStopwatchScreen({
      state: 'running',
      elapsedHundredths: 3391,
      banner: <Text>BANNER</Text>,
      syncState: 'on_device',
    });

    expect(screen.getByText('BANNER')).toBeOnTheScreen();
    expect(screen.getByLabelText('En el teléfono')).toBeOnTheScreen();
  });

  it('draws neither without them', async () => {
    await renderStopwatchScreen({ state: 'running', elapsedHundredths: 3391 });

    expect(screen.queryByTestId('sync-status')).toBeNull();
  });
});
