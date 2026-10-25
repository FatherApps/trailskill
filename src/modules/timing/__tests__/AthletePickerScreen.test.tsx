import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import { AthletePickerScreen } from '../screens/AthletePickerScreen';

// Synthetic data only.
const athletes = [
  { id: 'a1', shortName: 'Ana M.', initials: 'AM', color: 'athlete-1' as const },
  { id: 'a2', shortName: 'Cleo O.', initials: 'CO', color: 'athlete-3' as const },
];

const renderPicker = async (selectedIds: string[]) => {
  const handlers = { onToggle: jest.fn(), onDone: jest.fn(), onBack: jest.fn() };
  await render(
    <ThemeProvider>
      <AthletePickerScreen subtitle="Escuela Delfines" athletes={athletes} selectedIds={selectedIds} groupCount={3} {...handlers} />
    </ThemeProvider>,
  );
  return handlers;
};

describe('AthletePickerScreen', () => {
  it('shows the count, numbers the chosen athletes in order and reports taps and the exit buttons', async () => {
    const { onToggle, onDone, onBack } = await renderPicker(['a2']);

    expect(screen.getByText('Nadadores (1 de 3)')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^1 · Cleo O\./ })).toBeSelected();
    expect(screen.getByRole('button', { name: /^Ana M\./ })).not.toBeSelected();

    await fireEvent.press(screen.getByRole('button', { name: /^Ana M\./ }));
    expect(onToggle).toHaveBeenCalledWith('a1');
    await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
