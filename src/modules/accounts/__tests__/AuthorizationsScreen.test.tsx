import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryAuthorizationRepository, type AuthorizationText } from '../data/authorizations';
import { createInMemoryRegistrationDraftRepository } from '../data/registrationDraft';
import { AuthorizationsContainer } from '../screens/AuthorizationsContainer';
import { AuthorizationsScreen } from '../screens/AuthorizationsScreen';

jest.mock('../../../core/sync', () => ({ db: {}, RecordSyncStatus: jest.requireActual('../../../core/sync/RecordSyncStatus').RecordSyncStatus }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('../../../core/sync/syncState', () => ({ useRecordSyncState: () => 'on_device' }));
jest.mock('../../../core/sync/writes', () => ({ retryFailedRecord: jest.fn() }));

// Synthetic data only.
const texts: AuthorizationText[] = [
  { id: 't-record', purpose: 'record_times', version: 1, body: 'Synthetic record text' },
  { id: 't-import', purpose: 'import_official_results', version: 1, body: 'Synthetic import text' },
  { id: 't-share', purpose: 'share_results_with_school', version: 1, body: 'Synthetic share text' },
];
const athletes = [{ id: 'a1', name: 'Ana M.' }];
const RECORD = 'Registrar tiempos y resultados';
const IMPORT = 'Importar resultados oficiales';

async function renderContainer(props: Partial<React.ComponentProps<typeof AuthorizationsContainer>> = {}) {
  const repository = props.repository ?? createInMemoryAuthorizationRepository(texts);
  const onDone = jest.fn();
  const view = await render(
    <AuthorizationsContainer userId="guardian-1" athletes={athletes} mode="manage" onDone={onDone} {...props} repository={repository} />,
  );
  return { repository, onDone, view };
}

describe('AuthorizationsScreen', () => {
  it('smoke: lists every purpose unchecked with the provisional notice and the skipped tag', async () => {
    await render(<AuthorizationsScreen mode="manage" athletes={athletes} texts={texts} inForce={{}} onSave={jest.fn().mockResolvedValue(true)} onWithdraw={jest.fn()} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    screen.getAllByRole('checkbox').forEach((box) => expect(box).not.toBeChecked());
    expect(screen.getByText('Ana M.')).toBeOnTheScreen();
    expect(screen.getByRole('text', { name: 'Se omitirá' })).toBeOnTheScreen();
    expect(screen.getByTestId('banner')).toHaveTextContent('Textos provisionales: no uses esta app con datos reales hasta la revisión legal.');
  });

  it('saving calls onSave with exactly the checked purpose', async () => {
    const onSave = jest.fn().mockResolvedValue(true);
    await render(<AuthorizationsScreen mode="manage" athletes={athletes} texts={texts} inForce={{}} onSave={onSave} onWithdraw={jest.fn()} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: IMPORT }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSave).toHaveBeenCalledWith([{ athleteId: 'a1', text: texts[1] }]);
  });

  it('a failed save keeps the checked box checked', async () => {
    const onSave = jest.fn().mockResolvedValue(false);
    await render(<AuthorizationsScreen mode="manage" athletes={athletes} texts={texts} inForce={{}} onSave={onSave} onWithdraw={jest.fn()} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: IMPORT }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('checkbox', { name: IMPORT })).toBeChecked();
  });

  it('manage with nothing checked saves nothing', async () => {
    const onSave = jest.fn();
    await render(<AuthorizationsScreen mode="manage" athletes={athletes} texts={texts} inForce={{}} onSave={onSave} onWithdraw={jest.fn()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('AuthorizationsContainer', () => {
  it('opens with nothing checked even when the registration draft exists, and counts the steps', async () => {
    const drafts = createInMemoryRegistrationDraftRepository({ swimmer: 'adult', firstName: '', lastName: '', email: '' });
    await renderContainer({ mode: 'registration', drafts });

    expect(await screen.findByText('Paso 3 de 3')).toBeOnTheScreen();
    screen.getAllByRole('checkbox').forEach((box) => expect(box).not.toBeChecked());
  });

  it('registration continues without authorizing and clears the draft', async () => {
    const drafts = createInMemoryRegistrationDraftRepository({ swimmer: 'child', firstName: '', lastName: '', email: '' });
    const { repository, onDone } = await renderContainer({ mode: 'registration', drafts });

    await fireEvent.press(await screen.findByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(await repository.listAuthorizations('guardian-1', ['a1'])).toEqual([]);
    expect(await drafts.load()).toBeNull();
  });

  it('accepting one purpose writes exactly one row, for that purpose', async () => {
    const { repository } = await renderContainer();

    await fireEvent.press(await screen.findByRole('checkbox', { name: IMPORT }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/^Autorizado el /)).toBeOnTheScreen();
    const rows = await repository.listAuthorizations('guardian-1', ['a1']);
    expect(rows.map((row) => row.purpose)).toEqual(['import_official_results']);
    expect(rows[0]).toMatchObject({ textId: 't-import', textVersion: 1, textBody: 'Synthetic import text', athleteId: 'a1' });
    // The accepted purpose shows "En el teléfono" while it waits to be sent; the others stay unchecked.
    expect(screen.getByRole('text', { name: 'En el teléfono' })).toBeOnTheScreen();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('withdrawing asks first, and only confirming records it while keeping the evidence', async () => {
    const repository = createInMemoryAuthorizationRepository(texts);
    const id = await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: texts[0]! });
    const [before] = await repository.listAuthorizations('guardian-1', ['a1']);
    await renderContainer({ repository });
    await fireEvent.press(await screen.findByRole('button', { name: 'Retirar' }));

    // Cancelled: nothing is withdrawn.
    expect(screen.getByText('¿Retirar esta autorización?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await repository.isInForce('a1', 'record_times')).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Retirar' }));
    const buttons = screen.getAllByRole('button', { name: 'Retirar' });
    await fireEvent.press(buttons[buttons.length - 1]!);

    await waitFor(async () => expect(await repository.isInForce('a1', 'record_times')).toBe(false));
    const [after] = await repository.listAuthorizations('guardian-1', ['a1']);
    expect(after).toEqual({ ...before, id, withdrawnAt: expect.any(String) });
    // Back to a checkbox that starts unchecked.
    expect(await screen.findByRole('checkbox', { name: RECORD })).not.toBeChecked();
  });
});
