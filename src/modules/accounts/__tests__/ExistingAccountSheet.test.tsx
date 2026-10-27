import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ExistingAccountSheet } from '../components/ExistingAccountSheet';

const EMAIL = 'camila@example.test';

async function renderSheet(signOut = jest.fn().mockResolvedValue({ status: 'signed_out' })) {
  const onClose = jest.fn();
  await render(<ExistingAccountSheet email={EMAIL} signOut={signOut} onClose={onClose} />);
  return { signOut, onClose };
}

describe('ExistingAccountSheet', () => {
  it('tells the account exists and which address it is', async () => {
    await renderSheet();

    expect(screen.getByText('Ya hay una cuenta con este correo. Inicia sesión')).toBeOnTheScreen();
    expect(screen.getByText(EMAIL)).toBeOnTheScreen();
  });

  it('enters the app: closes the sheet and keeps the session', async () => {
    const { signOut, onClose } = await renderSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs out with the existing sign-out, never forced, and leaves navigation to the session gate', async () => {
    const { signOut, onClose } = await renderSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closing the sheet by back or by tapping outside leaves the person in the app and never signs out', async () => {
    const { signOut, onClose } = await renderSheet();
    const [modal] = screen.container.queryAll((node) => typeof node.props.onRequestClose === 'function');

    await fireEvent(modal, 'requestClose');
    await fireEvent.press(screen.getByTestId('confirm-sheet-scrim'));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(signOut).not.toHaveBeenCalled();
  });

  it.each([
    ['unsent records block it', jest.fn().mockResolvedValue({ status: 'blocked_pending', unsent: 2, rejected: 0 })],
    ['it fails', jest.fn().mockRejectedValue(new Error('offline'))],
  ])('stays in the app when %s', async (_why, signOut) => {
    const { onClose } = await renderSheet(signOut);
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
