import { fireEvent, render, screen } from '@testing-library/react-native';

import { SettingsScreen } from '../screens/SettingsScreen';

async function setup(overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
  const props = {
    themeMode: 'system' as const,
    timePrecision: 'hundredths' as const,
    onThemeModeChange: jest.fn(),
    onTimePrecisionChange: jest.fn(),
    vibrate: null,
    videoQuality: 'medium' as const,
    onVideoQualityChange: jest.fn(),
    onOpenVideo: jest.fn(),
    onBack: jest.fn(),
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

  it('offers the three video qualities and reports the chosen one', async () => {
    const props = await setup();
    for (const label of ['Baja 480p', 'Media 720p', 'Alta 1080p']) expect(screen.getByText(label)).toBeTruthy();
    await fireEvent.press(screen.getByText('Alta 1080p'));
    expect(props.onVideoQualityChange).toHaveBeenCalledWith('high');
  });

  it('shows the vibration only where the buttons are used, and reports it', async () => {
    await setup();
    expect(screen.queryByText('Vibrar al marcar')).toBeNull();

    const onChange = jest.fn();
    await setup({ vibrate: { value: true, onChange } });
    await fireEvent.press(screen.getByText('No'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('goes back', async () => {
    const props = await setup();
    await fireEvent.press(screen.getByLabelText('Volver'));
    expect(props.onBack).toHaveBeenCalled();
  });

  describe('the entries to the other screens', () => {
    it('opens "Cronómetro avanzado", "Configuración de video" and "Mi cuenta", in that order', async () => {
      const props = await setup({ onOpenStopwatch: jest.fn(), onOpenAccount: jest.fn() });

      await fireEvent.press(screen.getByRole('button', { name: 'Cronómetro avanzado' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Configuración de video' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Mi cuenta' }));
      expect(props.onOpenStopwatch).toHaveBeenCalledTimes(1);
      expect(props.onOpenVideo).toHaveBeenCalledTimes(1);
      expect(props.onOpenAccount).toHaveBeenCalledTimes(1);
      const order = screen.getAllByText(/^(Cronómetro avanzado|Configuración de video|Mi cuenta)$/).map((node) => node.props.children);
      expect(order).toEqual(['Cronómetro avanzado', 'Configuración de video', 'Mi cuenta']);
    });

    it('leaves out the entries it gets no handler for', async () => {
      await setup();

      expect(screen.queryByRole('button', { name: 'Cronómetro avanzado' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Mi cuenta' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Configuración de video' })).toBeOnTheScreen();
    });
  });
});
