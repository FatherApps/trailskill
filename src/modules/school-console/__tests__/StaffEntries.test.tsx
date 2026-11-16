import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeProvider } from '../../../core/theme';
import { StaffEntries } from '../components/StaffEntries';

const show = async (platformAdmin: boolean) => {
  const onOpen = jest.fn();
  await render(
    <ThemeProvider>
      <StaffEntries platformAdmin={platformAdmin} onOpen={onOpen}>
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
    const onOpen = await show(false);

    fireEvent.press(await screen.findByRole('button', { name }));

    expect(onOpen).toHaveBeenCalledWith(href);
  });

  it('hides the conflict review from anyone who is not a platform admin', async () => {
    await show(false);

    expect(screen.queryByRole('button', { name: 'Revisar conflictos' })).toBeNull();
  });

  it('shows the conflict review to a platform admin and opens its route', async () => {
    const onOpen = await show(true);

    fireEvent.press(await screen.findByRole('button', { name: 'Revisar conflictos' }));

    expect(onOpen).toHaveBeenCalledWith('/review-conflicts');
  });

  it('renders the sign-out slot it receives', async () => {
    await show(false);

    expect(screen.getByText('sign out slot')).toBeOnTheScreen();
  });
});
