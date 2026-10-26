import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import { TimeCorrectionScreen } from '../screens/TimeCorrectionScreen';

// Synthetic data only.
function renderScreen(props: Partial<Parameters<typeof TimeCorrectionScreen>[0]> = {}) {
  const callbacks = { onSave: jest.fn(), onBack: jest.fn() };
  return render(
    <ThemeProvider>
      <TimeCorrectionScreen
        subtitle="Libre 50 m"
        athleteName="Mateo C."
        initialTime={3391}
        {...callbacks}
        {...props}
      />
    </ThemeProvider>,
  ).then(() => callbacks);
}

const field = () => screen.getByLabelText('Nuevo tiempo');
const save = () => fireEvent.press(screen.getByRole('button', { name: 'Guardar corrección' }));

describe('TimeCorrectionScreen', () => {
  it('starts from the saved time and saves the typed one', async () => {
    const { onSave } = await renderScreen();

    expect(screen.getByText('Mateo C.')).toBeOnTheScreen();
    expect(field().props.value).toBe('33,91');
    await fireEvent.changeText(field(), '34,05');
    await save();

    expect(onSave).toHaveBeenCalledWith(3405);
  });

  it('saves an emptied field as a missing time, never zero', async () => {
    const { onSave } = await renderScreen();

    await fireEvent.changeText(field(), '');
    await save();

    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('starts empty when the saved time is missing', async () => {
    await renderScreen({ initialTime: null });

    expect(field().props.value).toBe('');
  });

  it('refuses text that is not a time and saves nothing', async () => {
    const { onSave } = await renderScreen();

    await fireEvent.changeText(field(), 'abc');
    await save();

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el tiempo como 35,20 o 1:05,30.')).toBeOnTheScreen();
  });

  it('shows the error that the save came back with', async () => {
    await renderScreen({ error: 'El tiempo debe ser mayor que cero.' });

    expect(screen.getByText('El tiempo debe ser mayor que cero.')).toBeOnTheScreen();
  });

  it('goes back', async () => {
    const { onBack } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
