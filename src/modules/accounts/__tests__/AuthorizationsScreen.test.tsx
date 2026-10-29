import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryAuthorizationRepository, type AuthorizationRecord, type AuthorizationRepository, type AuthorizationText } from '../data/authorizations';
import { createIdentityNumberHold, createInMemoryIdentityDocumentRepository } from '../data/identityDocuments';
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

  it('a second press before the first save resolves does not send the list again', async () => {
    let finish: (saved: boolean) => void = () => {};
    const onSave = jest.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    await render(<AuthorizationsScreen mode="registration" athletes={athletes} texts={texts} inForce={{}} onSave={onSave} onWithdraw={jest.fn()} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: IMPORT }));
    const button = screen.getByRole('button', { name: 'Continuar' });
    // Both presses land in the same tick, before any re-render could disable the button (fireEvent would wait for the pending save).
    await act(async () => {
      button.props.onClick({});
      button.props.onClick({});
    });
    await act(async () => finish(true));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('a failed save keeps the checked box checked', async () => {
    const onSave = jest.fn().mockResolvedValue(false);
    await render(<AuthorizationsScreen mode="manage" athletes={athletes} texts={texts} inForce={{}} onSave={onSave} onWithdraw={jest.fn()} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: IMPORT }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('checkbox', { name: IMPORT })).toBeChecked();
  });

  it('never re-sends a purpose already in force, and its box starts unchecked after a withdrawal', async () => {
    const onSave = jest.fn().mockResolvedValue(true);
    const record: AuthorizationRecord = {
      id: 'r1', userId: 'guardian-1', athleteId: 'a1', purpose: 'record_times', textId: 't-record', textVersion: 1,
      textBody: 'Synthetic record text', acceptedAt: '2026-01-01T00:00:00.000Z', withdrawnAt: null,
    };
    const props = { mode: 'manage' as const, athletes, texts, onSave, onWithdraw: jest.fn() };
    const view = await render(<AuthorizationsScreen {...props} inForce={{}} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: RECORD }));
    await fireEvent.press(screen.getByRole('checkbox', { name: IMPORT }));

    // A partial save made record_times accepted while its key was still selected.
    await view.rerender(<AuthorizationsScreen {...props} inForce={{ a1: { record_times: record } }} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave).toHaveBeenCalledWith([{ athleteId: 'a1', text: texts[1] }]);

    await view.rerender(<AuthorizationsScreen {...props} inForce={{}} />);
    expect(screen.getByRole('checkbox', { name: RECORD })).not.toBeChecked();
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

  it('shows the purpose as unchecked when the gate says it is not in force despite an own open row', async () => {
    const repository = createInMemoryAuthorizationRepository(texts);
    await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: texts[0]! });
    await renderContainer({ repository: { ...repository, isInForce: async () => false } });

    expect(await screen.findByRole('checkbox', { name: RECORD })).not.toBeChecked();
    expect(screen.queryByText(/^Autorizado el /)).toBeNull();
  });

  it('an authorization in force whose text is not on the phone yet is not offered again', async () => {
    const base = createInMemoryAuthorizationRepository(texts);
    const record: AuthorizationRecord = {
      id: 'r1', userId: 'guardian-1', athleteId: 'a1', purpose: 'record_times', textId: 't-not-synced', textVersion: null,
      textBody: null, acceptedAt: '2026-01-01T00:00:00.000Z', withdrawnAt: null,
    };
    await renderContainer({ repository: { ...base, listAuthorizations: async () => [record], isInForce: async () => true } });

    expect(await screen.findByText('Cargando el texto aceptado…')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: RECORD })).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByText(/^Autorizado el /)).toBeOnTheScreen();
  });

  it('a reload that started before accepting and lands after it does not undo it', async () => {
    const base = createInMemoryAuthorizationRepository(texts);
    let release = () => {};
    let holdNext = false;
    const repository: AuthorizationRepository = {
      ...base,
      listAuthorizations: async (...args) => {
        const rows = await base.listAuthorizations(...args);
        if (holdNext) {
          holdNext = false;
          await new Promise<void>((resolve) => (release = resolve));
        }
        return rows;
      },
    };
    const element = (refreshKey: number) => (
      <AuthorizationsContainer repository={repository} userId="guardian-1" athletes={athletes} mode="manage" onDone={jest.fn()} refreshKey={refreshKey} />
    );
    const view = await render(element(1));
    await screen.findByRole('checkbox', { name: IMPORT });

    // A sync reload starts and reads the rows as they are now: nothing accepted.
    holdNext = true;
    await view.rerender(element(2));
    await fireEvent.press(screen.getByRole('checkbox', { name: IMPORT }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/^Autorizado el /)).toBeOnTheScreen();

    await act(async () => release());

    expect(screen.getByText(/^Autorizado el /)).toBeOnTheScreen();
  });

  it('an adult never sees the 4-step header while the draft is still loading', async () => {
    const drafts = createInMemoryRegistrationDraftRepository({ swimmer: 'adult', firstName: '', lastName: '', email: '' });
    let release = () => {};
    const load = drafts.load;
    drafts.load = () => new Promise((resolve) => (release = () => resolve(load())));
    await renderContainer({ mode: 'registration', drafts });
    await act(async () => {});

    expect(screen.queryByText('Paso 4 de 4')).toBeNull();

    await act(async () => release());
    expect(await screen.findByText('Paso 3 de 3')).toBeOnTheScreen();
  });

  it('a load error shows the failure banner', async () => {
    const repository: AuthorizationRepository = {
      ...createInMemoryAuthorizationRepository(texts),
      listCurrentTexts: () => Promise.reject(new Error('no database')),
    };
    await renderContainer({ repository });

    expect(await screen.findByText(/No pudimos cargar las autorizaciones/)).toBeOnTheScreen();
  });

  it('a rejected accept keeps the screen and shows the failure banner', async () => {
    const repository: AuthorizationRepository = {
      ...createInMemoryAuthorizationRepository(texts),
      accept: () => Promise.reject(new Error('disk full')),
    };
    const { onDone } = await renderContainer({ mode: 'registration', repository });
    await fireEvent.press(await screen.findByRole('checkbox', { name: RECORD }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText(/No pudimos guardar en el teléfono/)).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('a rejected withdraw shows the failure banner', async () => {
    const base = createInMemoryAuthorizationRepository(texts);
    await base.accept({ userId: 'guardian-1', athleteId: 'a1', text: texts[0]! });
    await renderContainer({ repository: { ...base, withdraw: () => Promise.reject(new Error('disk full')) } });
    await fireEvent.press(await screen.findByRole('button', { name: 'Retirar' }));
    const buttons = screen.getAllByRole('button', { name: 'Retirar' });
    await fireEvent.press(buttons[buttons.length - 1]!);

    expect(await screen.findByText(/No pudimos guardar en el teléfono/)).toBeOnTheScreen();
  });
});

// Synthetic number only: never a real identity document.
describe('the identity number held from the registration', () => {
  function held() {
    const identityNumbers = createIdentityNumberHold();
    identityNumbers.put('a1', '987654321');
    return { identityNumbers, identityDocuments: createInMemoryIdentityDocumentRepository() };
  }
  const drafts = () => createInMemoryRegistrationDraftRepository({ swimmer: 'child', firstName: '', lastName: '', email: '' });

  it('is sent once the import of official results is accepted, and then forgotten', async () => {
    const { identityNumbers, identityDocuments } = held();
    const { onDone } = await renderContainer({ mode: 'registration', drafts: drafts(), identityNumbers, identityDocuments });

    await fireEvent.press(await screen.findByRole('checkbox', { name: IMPORT }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(identityDocuments.saved).toEqual([{ athleteId: 'a1', identityNumber: '987654321' }]);
    expect(identityNumbers.take('a1')).toBeUndefined();
  });

  it('without accepting the import of official results it is never sent, and is dropped', async () => {
    const { identityNumbers, identityDocuments } = held();
    const { onDone } = await renderContainer({ mode: 'registration', drafts: drafts(), identityNumbers, identityDocuments });

    await fireEvent.press(await screen.findByRole('checkbox', { name: RECORD }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(identityDocuments.saved).toEqual([]);
    expect(identityNumbers.take('a1')).toBeUndefined();
  });

  it('leaving the step without saving drops the number', async () => {
    const { identityNumbers, identityDocuments } = held();
    const { view } = await renderContainer({ mode: 'registration', drafts: drafts(), identityNumbers, identityDocuments });
    await screen.findByRole('checkbox', { name: IMPORT });

    await view.unmount();

    expect(identityNumbers.take('a1')).toBeUndefined();
    expect(identityDocuments.saved).toEqual([]);
  });

  it('a failed send does not stop the registration, and the number is dropped', async () => {
    const { identityNumbers, identityDocuments } = held();
    identityDocuments.failing = true;
    const { onDone } = await renderContainer({ mode: 'registration', drafts: drafts(), identityNumbers, identityDocuments });

    await fireEvent.press(await screen.findByRole('checkbox', { name: IMPORT }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(identityDocuments.saved).toEqual([]);
    expect(identityNumbers.take('a1')).toBeUndefined();
  });
});
