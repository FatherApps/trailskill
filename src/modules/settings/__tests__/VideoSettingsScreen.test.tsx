import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { defaultVideoRecording } from '../../../core/preferences';
import { VideoSettingsScreen } from '../screens/VideoSettingsScreen';

describe('VideoSettingsScreen', () => {
  it('is titled "Configuración de video" and offers the four stop delays', async () => {
    await render(<VideoSettingsScreen video={{ settings: defaultVideoRecording, onChange: jest.fn() }} onBack={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Configuración de video' })).toBeOnTheScreen();
    const stopAfter = within(screen.getByLabelText('Parar el video después de detener el reloj'));
    for (const label of ['0 s', '3 s', '5 s', '10 s']) expect(stopAfter.getByText(label)).toBeTruthy();
    expect(stopAfter.queryByText('1 s')).toBeNull();
  });

  it('shows the quality first, with its three choices, and reports the chosen one', async () => {
    const onChange = jest.fn();
    await render(<VideoSettingsScreen video={{ settings: defaultVideoRecording, onChange }} onBack={jest.fn()} />);
    const sections = screen
      .getAllByText(/^(Calidad del video|Grabar con audio|Mostrar el cronómetro en el video|Parar el video después de detener el reloj)$/)
      .map((node) => node.props.children);
    expect(sections[0]).toBe('Calidad del video');
    const quality = within(screen.getByLabelText('Calidad del video'));
    for (const label of ['Baja 480p', 'Media 720p', 'Alta 1080p']) expect(quality.getByText(label)).toBeTruthy();
    await fireEvent.press(quality.getByText('Alta 1080p'));
    expect(onChange).toHaveBeenCalledWith({ quality: 'high' });
  });

  it('reports each change', async () => {
    const onChange = jest.fn();
    await render(<VideoSettingsScreen video={{ settings: defaultVideoRecording, onChange }} onBack={jest.fn()} />);
    await fireEvent.press(within(screen.getByLabelText('Parar el video después de detener el reloj')).getByText('10 s'));
    await fireEvent.press(screen.getByRole('switch', { name: 'Grabar con audio' }));
    await fireEvent.press(screen.getByRole('switch', { name: 'Mostrar el cronómetro en el video' }));
    await fireEvent.press(screen.getByRole('switch', { name: 'Iniciar grabación y tiempo con el mismo botón' }));
    expect(onChange).toHaveBeenCalledWith({ audio: false });
    expect(onChange).toHaveBeenCalledWith({ showStopwatch: false });
    expect(onChange).toHaveBeenCalledWith({ startWithTime: true });
    expect(onChange).toHaveBeenCalledWith({ stopAfterSeconds: 10 });
  });

  it('goes back', async () => {
    const onBack = jest.fn();
    await render(<VideoSettingsScreen video={{ settings: defaultVideoRecording, onChange: jest.fn() }} onBack={onBack} />);
    await fireEvent.press(screen.getByLabelText('Volver'));
    expect(onBack).toHaveBeenCalled();
  });
});
