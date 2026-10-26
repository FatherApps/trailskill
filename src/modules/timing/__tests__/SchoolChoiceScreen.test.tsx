import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import { SchoolChoiceScreen } from '../screens/SchoolChoiceScreen';

// Synthetic data only.
const schools = [
  { id: 's1', name: 'Escuela Delfines' },
  { id: 's2', name: 'Escuela Tiburones' },
];

describe('SchoolChoiceScreen', () => {
  it('asks for the school with none chosen and reports the one tapped and the exit button', async () => {
    const handlers = { onChoose: jest.fn(), onBack: jest.fn() };
    await render(
      <ThemeProvider>
        <SchoolChoiceScreen schools={schools} {...handlers} />
      </ThemeProvider>,
    );

    expect(screen.getByText('¿En qué escuela vas a medir?')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Escuela Delfines' })).not.toBeSelected();
    expect(screen.getByRole('radio', { name: 'Escuela Tiburones' })).not.toBeSelected();

    await fireEvent.press(screen.getByRole('radio', { name: 'Escuela Tiburones' }));
    expect(handlers.onChoose).toHaveBeenCalledWith('s2');
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(handlers.onBack).toHaveBeenCalledTimes(1);
  });
});
