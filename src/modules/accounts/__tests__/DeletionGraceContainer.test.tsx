import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryAccountDeletionRepository } from '../data/accountDeletion';
import { DeletionGraceContainer } from '../screens/DeletionGraceContainer';

// Avoids loading the native PowerSync database.
jest.mock('../../../core/sync', () => ({}));

const DATE ='2026-12-20T15:00:00.000Z';

describe('DeletionGraceContainer', () => {
  it('shows the date and the way to cancel, and nothing else', async () => {
    await render(<DeletionGraceContainer repository={createInMemoryAccountDeletionRepository({ deleteAfter: DATE })} deleteAfter={DATE} online onCancelled={jest.fn()} />);

    expect(screen.getByText('Se borra el 20 de diciembre de 2026')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancelar eliminación' })).toBeOnTheScreen();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('takes the mark off and hands control back so the app returns to normal', async () => {
    const repository = createInMemoryAccountDeletionRepository({ deleteAfter: DATE });
    const onCancelled = jest.fn();
    await render(<DeletionGraceContainer repository={repository} deleteAfter={DATE} online onCancelled={onCancelled} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar eliminación' }));

    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(repository.deleteAfter).toBeNull();
  });

  it('does not call the server without signal, and says so', async () => {
    const repository = createInMemoryAccountDeletionRepository({ deleteAfter: DATE });
    const onCancelled = jest.fn();
    await render(<DeletionGraceContainer repository={repository} deleteAfter={DATE} online={false} onCancelled={onCancelled} />);

    await fireEvent.press(screen.getByRole('button', { name: /Cancelar eliminación/ }));

    expect(screen.getByText(/Sin conexión/)).toBeOnTheScreen();
    expect(repository.calls).toEqual([]);
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it('stays on the screen with a message when the server could not cancel', async () => {
    const repository = createInMemoryAccountDeletionRepository({ deleteAfter: DATE, failWith: 'unavailable' });
    const onCancelled = jest.fn();
    await render(<DeletionGraceContainer repository={repository} deleteAfter={DATE} online onCancelled={onCancelled} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar eliminación' }));

    expect(await screen.findByText('No pudimos cancelar la eliminación. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(onCancelled).not.toHaveBeenCalled();
  });
});
