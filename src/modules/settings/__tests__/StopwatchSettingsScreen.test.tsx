import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { defaultTimingButtons } from '../../../core/preferences';
import { StopwatchSettingsScreen, type SettingsButtonsView, type SettingsPrecisionView } from '../screens/StopwatchSettingsScreen';

function buttonsView(overrides: Partial<SettingsButtonsView> = {}): SettingsButtonsView {
  return {
    settings: defaultTimingButtons,
    startKeyName: 'Subir volumen (+)',
    splitKeyName: 'Bajar volumen (−)',
    keyboards: [],
    learning: null,
    onChange: jest.fn(),
    onLearn: jest.fn(),
    onCancelLearn: jest.fn(),
    ...overrides,
  };
}

async function setup(
  buttons: SettingsButtonsView | null = buttonsView(),
  freeLaps = { value: false, onChange: jest.fn() },
  precision: SettingsPrecisionView = { value: 'hundredths', onChange: jest.fn() },
) {
  const onBack = jest.fn();
  await render(<StopwatchSettingsScreen precision={precision} buttons={buttons} freeLaps={freeLaps} onBack={onBack} />);
  return { onBack, freeLaps, precision };
}

// The section names in the order they show.
const sectionOrder = () =>
  screen
    .getAllByText(/^(Precisión de los tiempos|Laps libres|Botones para cronometrar|Teclas|Bloqueo después de iniciar|Vibrar al marcar)$/)
    .map((node) => node.props.children);

describe('StopwatchSettingsScreen', () => {
  it('shows the precision first, then the free laps and the buttons, with the vibration last', async () => {
    await setup();
    expect(sectionOrder()).toEqual(['Precisión de los tiempos', 'Laps libres', 'Botones para cronometrar', 'Teclas', 'Bloqueo después de iniciar', 'Vibrar al marcar']);
  });

  it('offers the precision even without the buttons, and reports the chosen one', async () => {
    const { precision } = await setup(null);
    expect(sectionOrder()).toEqual(['Precisión de los tiempos', 'Laps libres']);
    for (const label of ['Centésimas', 'Milésimas']) expect(screen.getByText(label)).toBeTruthy();
    await fireEvent.press(screen.getByText('Milésimas'));
    expect(precision.onChange).toHaveBeenCalledWith('thousandths');
  });

  it('shows the example time in the chosen precision', async () => {
    await setup(null, undefined, { value: 'thousandths', onChange: jest.fn() });
    expect(screen.getByText('Ejemplo: 1:05,372')).toBeTruthy();
  });

  it('reports the vibration', async () => {
    const buttons = buttonsView();
    await setup(buttons);
    await fireEvent.press(screen.getByRole('switch', { name: 'Vibrar al marcar' }));
    expect(buttons.onChange).toHaveBeenCalledWith({ vibrate: false });
  });

  it('is titled "Cronómetro avanzado" and goes back', async () => {
    const { onBack } = await setup();
    expect(screen.getByRole('header', { name: 'Cronómetro avanzado' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Volver'));
    expect(onBack).toHaveBeenCalled();
  });

  it('hides the buttons where the phone cannot use them, and still offers the free laps', async () => {
    await setup(null);
    expect(screen.queryByText('Botones para cronometrar')).toBeNull();
    expect(screen.getByLabelText('Laps libres')).toBeOnTheScreen();
  });

  it('turns the free laps on and off', async () => {
    const { freeLaps } = await setup();
    await fireEvent.press(screen.getByRole('switch', { name: 'Laps libres' }));
    expect(freeLaps.onChange).toHaveBeenLastCalledWith(true);

    const on = { value: true, onChange: jest.fn() };
    await setup(buttonsView(), on);
    await fireEvent.press(screen.getByRole('switch', { name: 'Laps libres' }));
    expect(on.onChange).toHaveBeenLastCalledWith(false);
  });

  it('shows the keys and the lockout, and the phone keys when no headset is connected', async () => {
    await setup();
    expect(screen.getByText('Iniciar y detener: Subir volumen (+)')).toBeTruthy();
    expect(screen.getByText('Parcial: Bajar volumen (−)')).toBeTruthy();
    expect(screen.getByText('No hay diadema conectada: se usan los botones de volumen del teléfono.')).toBeTruthy();
    const lockout = within(screen.getByLabelText('Bloqueo después de iniciar'));
    for (const label of ['0 s', '1 s', '2 s', '3 s', '5 s', '10 s']) expect(lockout.getByText(label)).toBeTruthy();
  });

  it('names the connected headset', async () => {
    await setup(buttonsView({ keyboards: ['USB Headset'] }));
    expect(screen.getByText('Conectado: USB Headset')).toBeTruthy();
  });

  it('reports the lockout and turning the buttons off', async () => {
    const buttons = buttonsView();
    await setup(buttons);
    await fireEvent.press(within(screen.getByLabelText('Bloqueo después de iniciar')).getByText('5 s'));
    expect(buttons.onChange).toHaveBeenCalledWith({ lockoutSeconds: 5 });
    await fireEvent.press(screen.getByRole('switch', { name: 'Botones para cronometrar' }));
    expect(buttons.onChange).toHaveBeenCalledWith({ enabled: false });
  });

  it('asks for the new key while one is being chosen', async () => {
    const buttons = buttonsView();
    await setup(buttons);
    await fireEvent.press(screen.getByText('Cambiar Parcial'));
    expect(buttons.onLearn).toHaveBeenCalledWith('split');

    await setup(buttonsView({ learning: 'split', onCancelLearn: buttons.onCancelLearn }));
    expect(screen.getByText('Presiona ahora el botón que quieres usar.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(buttons.onCancelLearn).toHaveBeenCalled();
  });

  it('shows only the switch when the buttons are off', async () => {
    await setup(buttonsView({ settings: { ...defaultTimingButtons, enabled: false } }));
    expect(screen.queryByText('Teclas')).toBeNull();
    expect(screen.queryByText('Bloqueo después de iniciar')).toBeNull();
    expect(screen.queryByText('Vibrar al marcar')).toBeNull();
  });
});
