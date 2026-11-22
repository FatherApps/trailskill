import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { defaultTimingButtons } from '../../../core/preferences';
import { StopwatchSettingsScreen, type SettingsButtonsView } from '../screens/StopwatchSettingsScreen';

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

async function setup(buttons: SettingsButtonsView | null = buttonsView()) {
  const onBack = jest.fn();
  await render(<StopwatchSettingsScreen buttons={buttons} onBack={onBack} />);
  return { onBack };
}

describe('StopwatchSettingsScreen', () => {
  it('is titled "Cronómetro avanzado" and goes back', async () => {
    const { onBack } = await setup();
    expect(screen.getByRole('header', { name: 'Cronómetro avanzado' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Volver'));
    expect(onBack).toHaveBeenCalled();
  });

  it('hides the buttons where the phone cannot use them', async () => {
    await setup(null);
    expect(screen.queryByText('Botones para cronometrar')).toBeNull();
  });

  it('shows the keys and the lockout, and the phone keys when no headset is connected', async () => {
    await setup();
    expect(screen.getByText('Iniciar y detener: Subir volumen (+)')).toBeTruthy();
    expect(screen.getByText('Parcial: Bajar volumen (−)')).toBeTruthy();
    expect(screen.getByText('No hay diadema conectada: se usan los botones de volumen del teléfono.')).toBeTruthy();
    const lockout = within(screen.getByLabelText('Bloqueo después de iniciar'));
    for (const label of ['0 s', '1 s', '2 s', '3 s', '5 s', '10 s']) expect(lockout.getByText(label)).toBeTruthy();
    // The vibration moved to "Ajustes".
    expect(screen.queryByText('Vibrar al marcar')).toBeNull();
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
    await fireEvent.press(within(screen.getByLabelText('Botones para cronometrar')).getByText('No'));
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
  });
});
