import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import { ClaimSignedOutScreen } from '../screens/ClaimSignedOutScreen';

describe('ClaimSignedOutScreen', () => {
  it('asks to sign in and open the link again, and sends the person to sign in', async () => {
    const onSignIn = jest.fn();
    await render(
      <ThemeProvider>
        <ClaimSignedOutScreen onSignIn={onSignIn} />
      </ThemeProvider>,
    );

    expect(screen.getByText(/vuelve a abrir el enlace/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});
