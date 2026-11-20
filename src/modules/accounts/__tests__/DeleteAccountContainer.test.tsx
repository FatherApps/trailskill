import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryAccountDeletionRepository } from '../data/accountDeletion';
import { createInMemoryPendingInvitationRepository } from '../data/pendingInvitations';
import { createInMemoryRegistrationDraftRepository } from '../data/registrationDraft';
import { DeleteAccountContainer, type AccountExporter } from '../screens/DeleteAccountContainer';

// Avoids loading the native PowerSync database.
jest.mock('../../../core/sync', () => ({}));

const mockSession = { session: { user: { id: 'user-1' } }, signOut: jest.fn() };
jest.mock('../../../core/session', () => ({
  ...jest.requireActual('../../../core/session'),
  useSession: () => mockSession,
}));

const drafts = createInMemoryRegistrationDraftRepository();
const pending = createInMemoryPendingInvitationRepository();
const clearDraft = jest.spyOn(drafts, 'clear');

const NOTICE = 'Esto es lo que va a pasar';
const confirm = { name: 'Eliminar mis datos' };

beforeEach(() => {
  mockSession.signOut.mockReset().mockResolvedValue({ status: 'signed_out' });
  clearDraft.mockClear();
});

async function setup(options: { repository?: ReturnType<typeof createInMemoryAccountDeletionRepository>; online?: boolean; exporter?: AccountExporter } = {}) {
  const repository = options.repository ?? createInMemoryAccountDeletionRepository();
  const onBack = jest.fn();
  const view = await render(
    <DeleteAccountContainer repository={repository} online={options.online ?? true} exporter={options.exporter} drafts={drafts} pending={pending} onBack={onBack} />,
  );
  return { repository, onBack, view };
}

async function toCodeStep() {
  await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Enviarme el código' }));
  await screen.findByText('Escribe el código');
}

describe('DeleteAccountContainer', () => {
  it('offers to export first, and only when an export is wired', async () => {
    const exporter = { export: jest.fn().mockResolvedValue(undefined) };
    await setup({ exporter });

    await fireEvent.press(screen.getByRole('button', { name: 'Exportar mis datos' }));

    expect(exporter.export).toHaveBeenCalledTimes(1);
  });

  it('shows no export button when nothing is wired', async () => {
    await setup();

    expect(screen.queryByRole('button', { name: 'Exportar mis datos' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeOnTheScreen();
  });

  it('says when the export failed', async () => {
    await setup({ exporter: { export: jest.fn().mockRejectedValue(new Error('no signal')) } });

    await fireEvent.press(screen.getByRole('button', { name: 'Exportar mis datos' }));

    expect(await screen.findByText('No pudimos exportar tus datos. Inténtalo de nuevo.')).toBeOnTheScreen();
  });

  it('shows the 30-day, irreversibility and pending-uploads notice before it asks the server for the code', async () => {
    const { repository } = await setup();

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    expect(screen.getByText(NOTICE)).toBeOnTheScreen();
    expect(screen.getByText(/a los 30 días/)).toBeOnTheScreen();
    expect(screen.getByText(/no se puede recuperar/)).toBeOnTheScreen();
    expect(screen.getByText(/aún no se han enviado se pierden/)).toBeOnTheScreen();
    expect(repository.calls).toEqual([]);
  });

  it('names the school the server says still links the account and offers no way to confirm', async () => {
    const { repository } = await setup({ repository: createInMemoryAccountDeletionRepository({ blockedBy: [{ id: 's1', name: 'Escuela Sintética' }] }) });

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enviarme el código' }));

    expect(await screen.findByText(/Escuela Sintética/)).toBeOnTheScreen();
    expect(screen.getByText(/Contáctala/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', confirm)).toBeNull();
    expect(screen.queryByText('Escribe el código')).toBeNull();
    expect(repository.calls).toEqual(['request']);
  });

  it('sends an administrator to support', async () => {
    await setup({ repository: createInMemoryAccountDeletionRepository({ platformAdmin: true }) });

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enviarme el código' }));

    expect(await screen.findByText(/soporte@fatherapps\.com/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', confirm)).toBeNull();
  });

  it('does not call the server without signal, and says so', async () => {
    const repository = createInMemoryAccountDeletionRepository();
    await setup({ repository, online: false });

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText(/Sin conexión/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Enviarme el código/ }));

    expect(repository.calls).toEqual([]);
    expect(screen.getByText(NOTICE)).toBeOnTheScreen();
  });

  it('does not confirm without signal even with the code typed', async () => {
    const repository = createInMemoryAccountDeletionRepository();
    const { view } = await setup({ repository });
    await toCodeStep();
    await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '123456');
    await view.rerender(<DeleteAccountContainer repository={repository} online={false} drafts={drafts} pending={pending} onBack={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: /^Eliminar mis datos/ }));

    expect(repository.calls).toEqual(['request']);
    expect(mockSession.signOut).not.toHaveBeenCalled();
  });

  it('keeps the person on the code step with the error when the code does not match', async () => {
    const { repository } = await setup();
    await toCodeStep();

    await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '000000');
    await fireEvent.press(screen.getByRole('button', confirm));

    expect(await screen.findByText('El código no coincide.')).toBeOnTheScreen();
    expect(repository.deleteAfter).toBeNull();
    expect(mockSession.signOut).not.toHaveBeenCalled();
  });

  it('shows the deletion date after confirming and only then ends the session, forced, through the session provider', async () => {
    const { repository } = await setup();
    await toCodeStep();

    await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '123456');
    await fireEvent.press(screen.getByRole('button', confirm));

    expect(await screen.findByText('Se borra el 20 de diciembre de 2026')).toBeOnTheScreen();
    expect(repository.calls).toEqual(['request', 'confirm']);
    // The date stays on the screen until the person leaves: signing out at once would take it away unseen.
    expect(mockSession.signOut).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Salir' }));

    await waitFor(() => expect(mockSession.signOut).toHaveBeenCalledWith({ force: true }));
    await waitFor(() => expect(clearDraft).toHaveBeenCalledTimes(1));
  });

  it('says when the session could not be ended and lets the person try again', async () => {
    mockSession.signOut.mockRejectedValueOnce(new Error('clear failed'));
    await setup({ repository: createInMemoryAccountDeletionRepository({ deleteAfter: '2026-12-20T15:00:00.000Z' }) });
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enviarme el código' }));
    // An account that is already marked goes straight to its date.
    await screen.findByText('Se borra el 20 de diciembre de 2026');

    await fireEvent.press(screen.getByRole('button', { name: 'Salir' }));

    expect(await screen.findByText('No pudimos cerrar la sesión. Inténtalo de nuevo.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Salir' }));
    await waitFor(() => expect(mockSession.signOut).toHaveBeenCalledTimes(2));
  });
});
