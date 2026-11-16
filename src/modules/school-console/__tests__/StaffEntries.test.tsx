import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeProvider } from '../../../core/theme';
import { StaffEntries } from '../components/StaffEntries';

const show = async () => {
  const onOpen = jest.fn();
  await render(
    <ThemeProvider>
      <StaffEntries onOpen={onOpen}>
        <Text>sign out slot</Text>
      </StaffEntries>
    </ThemeProvider>,
  );
  return onOpen;
};

describe('StaffEntries', () => {
  it.each([
    ['Toma de tiempos', '/timing'],
    ['Toma en serie', '/timing?mode=series'],
    ['Registrar completado', '/timing?mode=completed'],
    ['Planes de entrenamiento', '/plans'],
  ])('shows %s and opens the route the home screen uses', async (name, href) => {
    const onOpen = await show();

    fireEvent.press(await screen.findByRole('button', { name }));

    expect(onOpen).toHaveBeenCalledWith(href);
  });

  it('shows the conflict review and opens the route the home screen uses', async () => {
    const onOpen = await show();

    fireEvent.press(await screen.findByRole('button', { name: 'Revisar conflictos' }));

    expect(onOpen).toHaveBeenCalledWith('/review-conflicts');
  });

  it('renders the sign-out slot it receives', async () => {
    await show();

    expect(screen.getByText('sign out slot')).toBeOnTheScreen();
  });
});
