import { fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler, Text } from 'react-native';

import { TimingHeader } from '../components/TimingHeader';
import { StopwatchScreen } from '../screens/StopwatchScreen';
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

  it('draws the athletes slot between the selectors and the start button, and nothing without it', async () => {
    await renderSetup({ athletes: <Text>ATHLETES SLOT</Text> });

    const tree = JSON.stringify(screen.toJSON());
    const at = (text: string) => tree.indexOf(text);
    expect(at('Cronómetro externo')).toBeGreaterThan(-1);
    expect(at('ATHLETES SLOT')).toBeGreaterThan(at('Cronómetro externo'));
    expect(at('Empezar toma')).toBeGreaterThan(at('ATHLETES SLOT'));
  });

  it('renders no athlete rows when the slot is absent', async () => {
    await renderSetup();

    expect(screen.queryByText('ATHLETES SLOT')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
