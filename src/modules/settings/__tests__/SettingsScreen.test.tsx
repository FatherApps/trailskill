import { fireEvent, render, screen } from '@testing-library/react-native';

import { SettingsScreen } from '../screens/SettingsScreen';

async function setup(overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
  const props = {
    themeMode: 'system' as const,
    onThemeModeChange: jest.fn(),
    onOpenVideo: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  };
  await render(<SettingsScreen {...props} />);
  return props;
}

describe('SettingsScreen', () => {
  it('offers the four themes and reports the chosen one', async () => {
    const props = await setup();
    for (const label of ['Sistema', 'Claro', 'Oscuro', 'Sol']) expect(screen.getByText(label)).toBeTruthy();
    await fireEvent.press(screen.getByText('Sol'));
    expect(props.onThemeModeChange).toHaveBeenCalledWith('sun');
  });

  it('shows only the theme: the precision, the vibration and the video quality live in their own screens', async () => {
    await setup({ onOpenStopwatch: jest.fn() });
    expect(screen.queryByText('Precisión de los tiempos')).toBeNull();
    expect(screen.queryByText('Milésimas')).toBeNull();
    expect(screen.queryByText('Vibrar al marcar')).toBeNull();
    expect(screen.queryByText('Calidad del video')).toBeNull();
    expect(screen.queryByText('Alta 1080p')).toBeNull();
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
