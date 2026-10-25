import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ThemeProvider } from '../../../core/theme';
import { CompletedScreen, type CompletedScreenProps } from '../screens/CompletedScreen';

const hidden = { includeHiddenElements: true };

// Synthetic data only.
const athletes: CompletedScreenProps['athletes'] = [
  { id: 'a1', shortName: 'Mateo C.', initials: 'MC', color: 'athlete-1', completed: true, syncState: 'on_device' },
  { id: 'a2', shortName: 'Lucía R.', initials: 'LR', color: 'athlete-2', completed: false },
  { id: 'a3', shortName: 'Sara P.', initials: 'SP', color: 'athlete-3', completed: true, syncState: 'synced' },
];

async function renderScreen(props: Partial<CompletedScreenProps> = {}) {
  const callbacks = { onToggle: jest.fn(), onRetry: jest.fn(), onFinish: jest.fn(), onBack: jest.fn() };
  await render(
    <ThemeProvider>
      <CompletedScreen subtitle="Libre 50 m · Entrenamiento" athletes={athletes} {...callbacks} {...props} />
    </ThemeProvider>,
  );
  return callbacks;
}

describe('CompletedScreen', () => {
  it('lists one switch per athlete, labelled with the name and checked only for the completed ones', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Completado sin tiempo' })).toBeOnTheScreen();
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    expect(screen.getByRole('switch', { name: 'Completado, Mateo C.' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Completado, Lucía R.' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Completado, Sara P.' })).toBeChecked();
  });

  it('tells Completado apart from a missing time and never prints 0,00', async () => {
    await renderScreen();

    expect(screen.getAllByLabelText('Completado, sin tiempo', hidden)).toHaveLength(2);
    expect(screen.getAllByLabelText('Sin registro', hidden)).toHaveLength(1);
    expect(screen.queryByText(/\d,\d\d/, hidden)).toBeNull();
  });

  it('keeps the switch at least as big as the minimum touch target', async () => {
    await renderScreen();

    const sizes = within(screen.getByRole('switch', { name: 'Completado, Lucía R.' }))
      .getAllByRole('button', hidden)
      .map((button) => StyleSheet.flatten(button.props.style)?.minHeight);
    expect(sizes.every((minHeight) => minHeight >= 48)).toBe(true);
  });

  it('shows the sync pill of the completed ones only', async () => {
    await renderScreen();

    expect(screen.getByText('En el teléfono', hidden)).toBeOnTheScreen();
    expect(screen.getByText('Enviado', hidden)).toBeOnTheScreen();
    expect(screen.getAllByTestId('sync-status')).toHaveLength(2);
  });

  it('asks to toggle the athlete that was pressed', async () => {
    const { onToggle } = await renderScreen();

    await fireEvent.press(screen.getByRole('switch', { name: 'Completado, Lucía R.' }));

    expect(onToggle).toHaveBeenCalledWith('a2');
  });

  it('shows the empty state when nobody was chosen', async () => {
    await renderScreen({ athletes: [] });

    expect(screen.getByText('Aún no hay nadadores')).toBeOnTheScreen();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('shows why a toggle did not go through and the offline notice', async () => {
    await renderScreen({ error: 'No pudimos guardar. Inténtalo de nuevo.', offline: true });

    expect(screen.getByText('No pudimos guardar. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(screen.getByText('Sin conexión.', { exact: false })).toBeOnTheScreen();
  });

  it('finishes and goes back', async () => {
    const { onFinish, onBack } = await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Terminar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
