import { fireEvent, render, screen } from '@testing-library/react-native';

import { defaultTimingButtons } from '../../../core/preferences';
import { SettingsScreen, type SettingsButtonsView } from '../screens/SettingsScreen';

async function setup(overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
  const props = {
    themeMode: 'system' as const,
    timePrecision: 'hundredths' as const,
    onThemeModeChange: jest.fn(),
    onTimePrecisionChange: jest.fn(),
    onBack: jest.fn(),
    buttons: null,
    ...overrides,
  };
  await render(<SettingsScreen {...props} />);
  return props;
}

describe('SettingsScreen', () => {
  it('offers the four themes and the two precisions', async () => {
    await setup();
    for (const label of ['Sistema', 'Claro', 'Oscuro', 'Sol', 'Centésimas', 'Milésimas']) expect(screen.getByText(label)).toBeTruthy();
  });

  it('reports the chosen theme and precision', async () => {
    const props = await setup();
    await fireEvent.press(screen.getByText('Sol'));
    await fireEvent.press(screen.getByText('Milésimas'));
    expect(props.onThemeModeChange).toHaveBeenCalledWith('sun');
    expect(props.onTimePrecisionChange).toHaveBeenCalledWith('thousandths');
  });

  it('shows the example time in the chosen precision', async () => {
    await setup({ timePrecision: 'thousandths' });
    expect(screen.getByText('Ejemplo: 1:05,372')).toBeTruthy();
  });

  it('goes back', async () => {
    const props = await setup();
    await fireEvent.press(screen.getByLabelText('Volver'));
    expect(props.onBack).toHaveBeenCalled();
  });
});

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

describe('SettingsScreen timing buttons', () => {
  it('hides the buttons where the phone cannot use them', async () => {
    await setup();
    expect(screen.queryByText('Botones para cronometrar')).toBeNull();
  });

  it('shows the keys, the lockout and the vibration, and the phone keys when no headset is connected', async () => {
    await setup({ buttons: buttonsView() });
    expect(screen.getByText('Iniciar y detener: Subir volumen (+)')).toBeTruthy();
    expect(screen.getByText('Parcial: Bajar volumen (−)')).toBeTruthy();
    expect(screen.getByText('No hay diadema conectada: se usan los botones de volumen del teléfono.')).toBeTruthy();
    for (const label of ['0 s', '1 s', '2 s', '3 s', '5 s', '10 s']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText('Vibrar al marcar')).toBeTruthy();
  });

  it('names the connected headset', async () => {
    await setup({ buttons: buttonsView({ keyboards: ['USB Headset'] }) });
    expect(screen.getByText('Conectado: USB Headset')).toBeTruthy();
  });

  it('reports the lockout, the vibration and turning the buttons off', async () => {
    const buttons = buttonsView();
    await setup({ buttons });
    await fireEvent.press(screen.getByText('5 s'));
    expect(buttons.onChange).toHaveBeenCalledWith({ lockoutSeconds: 5 });
    await fireEvent.press(screen.getAllByText('No')[1]!);
    expect(buttons.onChange).toHaveBeenCalledWith({ vibrate: false });
    await fireEvent.press(screen.getAllByText('No')[0]!);
    expect(buttons.onChange).toHaveBeenCalledWith({ enabled: false });
  });

  it('asks for the new key while one is being chosen', async () => {
    const buttons = buttonsView();
    await setup({ buttons });
    await fireEvent.press(screen.getByText('Cambiar Parcial'));
    expect(buttons.onLearn).toHaveBeenCalledWith('split');

    await setup({ buttons: buttonsView({ learning: 'split', onCancelLearn: buttons.onCancelLearn }) });
    expect(screen.getByText('Presiona ahora el botón que quieres usar.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(buttons.onCancelLearn).toHaveBeenCalled();
  });

  it('shows only the switch when the buttons are off', async () => {
    await setup({ buttons: buttonsView({ settings: { ...defaultTimingButtons, enabled: false } }) });
    expect(screen.queryByText('Teclas')).toBeNull();
  });
});
