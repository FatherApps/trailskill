import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryAuthorizationRepository, type AuthorizationRecord, type AuthorizationRepository, type AuthorizationText } from '../data/authorizations';
import { createInMemoryInvitationRepository } from '../data/invitations';
import { createIdentityNumberHold, createInMemoryIdentityDocumentRepository } from '../data/identityDocuments';
import { createInMemoryPendingInvitationRepository } from '../data/pendingInvitations';
import { createInMemoryRegistrationDraftRepository } from '../data/registrationDraft';
import { AuthorizationsContainer } from '../screens/AuthorizationsContainer';
import { AuthorizationsScreen } from '../screens/AuthorizationsScreen';

// The pending queue has a SecureStore-backed twin next to the in-memory one.
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: '', document: '' } }));
jest.mock('../../../core/sync', () => ({
  db: {},
  supabase: {},
  RecordSyncStatus: jest.requireActual('../../../core/sync/RecordSyncStatus').RecordSyncStatus,
  useRecordSyncState: () => 'on_device',
}));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('../../../core/sync/syncState', () => ({ useRecordSyncState: () => 'on_device' }));
jest.mock('../../../core/sync/writes', () => ({ retryFailedRecord: jest.fn() }));
// The avatar reads the photo and show_photo from the local database; here it is a plain marker.
jest.mock('../components/AthleteAvatarWithPhoto', () => {
  const { Text } = jest.requireActual('react-native');
  return { AthleteAvatarWithPhoto: ({ initials }: { initials: string }) => <Text>{`avatar ${initials}`}</Text> };
});

// Synthetic data only.
const texts: AuthorizationText[] = [
  { id: 't-record', purpose: 'record_times', version: 1, body: 'Synthetic record text' },
  { id: 't-import', purpose: 'import_official_results', version: 1, body: 'Synthetic import text' },
  { id: 't-share', purpose: 'share_results_with_school', version: 1, body: 'Synthetic share text' },
  { id: 't-photo', purpose: 'show_photo', version: 1, body: 'Synthetic photo text' },
];
const athletes = [{ id: 'a1', name: 'Ana M.' }];
const RECORD = 'Registrar tiempos y resultados';
const IMPORT = 'Importar resultados oficiales';
const PHOTO = 'Mostrar la foto del deportista';
// Withdrawing: the checkbox of the authorization in force opens the sheet, whose confirm button is the only "Retirar".
async function withdraw(purpose: string) {
  await fireEvent.press(await screen.findByRole('checkbox', { name: purpose }));
  await fireEvent.press(screen.getByRole('button', { name: 'Retirar' }));
}

async function renderContainer(props: Partial<React.ComponentProps<typeof AuthorizationsContainer>> = {}) {
  const repository = props.repository ?? createInMemoryAuthorizationRepository(texts);
  const onDone = jest.fn();
  const view = await render(
    <AuthorizationsContainer userId="guardian-1" athletes={athletes} mode="manage" onDone={onDone} {...props} repository={repository} />,
  );
  return { repository, onDone, view };
}

describe('AuthorizationsScreen', () => {
  it('leaves through the shared round Back button when it is managed outside the registration', async () => {
    const onBack = jest.fn();
    await render(<AuthorizationsScreen mode="manage" athletes={athletes} texts={texts} inForce={{}} onSave={jest.fn().mockResolvedValue(true)} onWithdraw={jest.fn()} onBack={onBack} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('smoke: one card per athlete, each with every purpose unchecked, the provisional notice and the skipped tag', async () => {
    const two = [...athletes, { id: 'a2', name: 'Tomás P.' }];
    await render(<AuthorizationsScreen mode="manage" athletes={two} texts={texts} inForce={{}} onSave={jest.fn().mockResolvedValue(true)} onWithdraw={jest.fn()} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    screen.getAllByRole('checkbox').forEach((box) => expect(box).not.toBeChecked());
    expect(screen.getAllByRole('checkbox', { name: PHOTO })).toHaveLength(2);
    expect(screen.getByRole('header', { name: 'Ana M.' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Tomás P.' })).toBeOnTheScreen();
    expect(screen.getByText('avatar AM')).toBeOnTheScreen();
    expect(screen.getAllByRole('text', { name: 'Se omitirá' })).toHaveLength(2);
    expect(screen.getByTestId('banner')).toHaveTextContent('Textos provisionales: no uses esta app con datos reales hasta la revisión legal.');
    expect(screen.queryByText('Synthetic record text')).toBeNull();
  });

  it('marking boxes without pressing the footer saves nothing', async () => {
    const onSave = jest.fn();
    await render(<AuthorizationsScreen mode="manage" athletes={athletes} texts={texts} inForce={{}} onSave={onSave} onWithdraw={jest.fn()} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: IMPORT }));

    expect(screen.getByRole('checkbox', { name: IMPORT })).toBeChecked();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('withdrawing: unchecking a box in force asks first; cancelling keeps it checked and calls nothing', async () => {
    const onWithdraw = jest.fn();
    const record: AuthorizationRecord = {
      id: 'r1', userId: 'guardian-1', athleteId: 'a1', purpose: 'record_times', textId: 't-record', textVersion: 1,
      textBody: 'Synthetic record text', acceptedAt: '2026-01-01T00:00:00.000Z', withdrawnAt: null,
    };
    await render(<AuthorizationsScreen mode="manage" athletes={athletes} texts={texts} inForce={{ a1: { record_times: record } }} onSave={jest.fn()} onWithdraw={onWithdraw} />);
    expect(screen.getByRole('checkbox', { name: RECORD })).toBeChecked();

    await fireEvent.press(screen.getByRole('checkbox', { name: RECORD }));
    expect(screen.getByText('¿Retirar esta autorización?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onWithdraw).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: RECORD })).toBeChecked();

    await fireEvent.press(screen.getByRole('checkbox', { name: RECORD }));
    await fireEvent.press(screen.getByRole('button', { name: 'Retirar' }));
    expect(onWithdraw).toHaveBeenCalledWith('r1');
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

    await waitFor(() => expect(screen.getByRole('checkbox', { name: IMPORT })).toBeChecked());
    const rows = await repository.listAuthorizations('guardian-1', ['a1']);
    expect(rows.map((row) => row.purpose)).toEqual(['import_official_results']);
    expect(rows[0]).toMatchObject({ textId: 't-import', textVersion: 1, textBody: 'Synthetic import text', athleteId: 'a1' });
    // The accepted purpose shows "En el teléfono" while it waits to be sent; the others stay unchecked.
    expect(screen.getByRole('text', { name: 'En el teléfono' })).toBeOnTheScreen();
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(1);
  });

  it('managing: a successful Guardar goes back to the previous view, once', async () => {
    const { onDone } = await renderContainer();

    await fireEvent.press(await screen.findByRole('checkbox', { name: IMPORT }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('managing: a failed Guardar does not go back', async () => {
    const repository: AuthorizationRepository = {
      ...createInMemoryAuthorizationRepository(texts),
      accept: () => Promise.reject(new Error('disk full')),
    };
    const { onDone } = await renderContainer({ repository });

    await fireEvent.press(await screen.findByRole('checkbox', { name: IMPORT }));
    await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/No pudimos guardar en el teléfono/)).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('withdrawing asks first, and only confirming records it while keeping the evidence', async () => {
    const repository = createInMemoryAuthorizationRepository(texts);
    const id = await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: texts[0]! });
    const [before] = await repository.listAuthorizations('guardian-1', ['a1']);
    await renderContainer({ repository });

    // Cancelled: nothing is withdrawn.
    await fireEvent.press(await screen.findByRole('checkbox', { name: RECORD }));
    expect(screen.getByText('¿Retirar esta autorización?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await repository.isInForce('a1', 'record_times')).toBe(true);

    await fireEvent.press(screen.getByRole('checkbox', { name: RECORD }));
    await fireEvent.press(screen.getByRole('button', { name: 'Retirar' }));

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
    await fireEvent.press(screen.getByRole('button', { name: 'Leer el texto completo' }));
    expect(screen.queryByText(/^Autorizado el /)).toBeNull();
  });

  it('an authorization in force whose text is not on the phone yet is not offered again', async () => {
    const base = createInMemoryAuthorizationRepository(texts);
    const record: AuthorizationRecord = {
      id: 'r1', userId: 'guardian-1', athleteId: 'a1', purpose: 'record_times', textId: 't-not-synced', textVersion: null,
      textBody: null, acceptedAt: '2026-01-01T00:00:00.000Z', withdrawnAt: null,
    };
    await renderContainer({ repository: { ...base, listAuthorizations: async () => [record], isInForce: async () => true } });

    // In force (checked), so it is withdrawn rather than offered again; its text shows once the card is expanded.
    expect(await screen.findByRole('checkbox', { name: RECORD })).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Leer el texto completo' }));
    expect(screen.getByText('Cargando el texto aceptado…')).toBeOnTheScreen();
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
    await waitFor(() => expect(screen.getByRole('checkbox', { name: IMPORT })).toBeChecked());

    await act(async () => release());

    expect(screen.getByRole('checkbox', { name: IMPORT })).toBeChecked();
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
    await withdraw(RECORD);

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

  it('after adding from «+» (added): titled Autorizaciones with no registration step, it continues without authorizing and still sends the number', async () => {
    const { identityNumbers, identityDocuments } = held();
    const { onDone } = await renderContainer({ mode: 'added', identityNumbers, identityDocuments });

    await fireEvent.press(await screen.findByRole('checkbox', { name: IMPORT }));
    expect(screen.queryByText('Crear cuenta')).toBeNull();
    expect(screen.queryByText(/Paso/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(identityDocuments.saved).toEqual([{ athleteId: 'a1', identityNumber: '987654321' }]);
  });

  it('after adding from «+» (added): «Continuar» with nothing checked goes on', async () => {
    const { onDone } = await renderContainer({ mode: 'added' });

    await fireEvent.press(await screen.findByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
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

// Issue 1222: withdrawing show_photo offers to delete the photo too. The photo service is a fake that records what it was asked.
describe('AuthorizationsContainer: withdrawing show_photo', () => {
  const photoText = texts.find((text) => text.purpose === 'show_photo')!;
  const row = { id: 'row-1', storagePath: 'a1/11111111-1111-4111-8111-111111111111.jpg' };

  async function withdrawPhotoAuthorization(found: typeof row | null, purpose: 'show_photo' | 'record_times' = 'show_photo') {
    const repository = createInMemoryAuthorizationRepository(texts);
    await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: purpose === 'show_photo' ? photoText : texts[0]! });
    const calls: string[] = [];
    const photos = {
      discard: jest.fn(async () => void calls.push('discard')),
      find: jest.fn(async () => found),
      remove: jest.fn(async () => void calls.push('remove')),
    };
    await renderContainer({ repository, photos });
    await withdraw(purpose === 'show_photo' ? PHOTO : RECORD);
    return { photos, calls };
  }

  it('offers to delete the stored photo and deletes it, by the row it found, when the person accepts', async () => {
    const { photos, calls } = await withdrawPhotoAuthorization(row);

    await fireEvent.press(await screen.findByRole('button', { name: 'Borrar la foto' }));

    await waitFor(() => expect(photos.remove).toHaveBeenCalledWith('a1', row));
    // What waited on the phone to be sent left first.
    expect(calls).toEqual(['discard', 'remove']);
  });

  it('keeps the photo when the person chooses to keep it', async () => {
    const { photos } = await withdrawPhotoAuthorization(row);

    await fireEvent.press(await screen.findByRole('button', { name: 'Conservarla' }));

    expect(photos.remove).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Borrar la foto' })).toBeNull();
  });

  it('says so and keeps the offer when the photo could not be deleted', async () => {
    const repository = createInMemoryAuthorizationRepository(texts);
    await repository.accept({ userId: 'guardian-1', athleteId: 'a1', text: photoText });
    const photos = { discard: jest.fn(async () => {}), find: jest.fn(async () => row), remove: jest.fn().mockRejectedValue(new Error('Network request failed')) };
    await renderContainer({ repository, photos });
    await withdraw(PHOTO);

    await fireEvent.press(await screen.findByRole('button', { name: 'Borrar la foto' }));

    expect(await screen.findByText('No pudimos borrar la foto. Revisa la señal e inténtalo de nuevo.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Borrar la foto' })).toBeOnTheScreen();
  });

  it('offers nothing when the athlete has no stored photo, but still drops a waiting one', async () => {
    const { photos } = await withdrawPhotoAuthorization(null);

    await waitFor(() => expect(photos.discard).toHaveBeenCalledWith('a1'));
    expect(screen.queryByRole('button', { name: 'Borrar la foto' })).toBeNull();
  });

  it('offers nothing when another purpose is withdrawn', async () => {
    const { photos } = await withdrawPhotoAuthorization(row, 'record_times');

    expect(photos.find).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Borrar la foto' })).toBeNull();
  });
});

// Issue 1328: joining a school accepts record_times, import_official_results and share_results_with_school together.
describe('AuthorizationsScreen: joining a school', () => {
  const two = [...athletes, { id: 'a2', name: 'Tomás P.' }];
  const props = (extra: Partial<React.ComponentProps<typeof AuthorizationsScreen>> = {}) => ({
    mode: 'registration' as const,
    athletes: two,
    texts,
    inForce: {},
    onSave: jest.fn().mockResolvedValue(true),
    onWithdraw: jest.fn(),
    join: { athletes: ['Ana M.', 'Tomás P.'], onAccept: jest.fn().mockResolvedValue(true), onDecline: jest.fn().mockResolvedValue(true) },
    ...extra,
  });

  it('shows the three purposes with their full text and version, without checkboxes, the swimmers who join, and the optional photo box', async () => {
    await render(<AuthorizationsScreen {...props()} />);

    for (const body of ['Synthetic record text', 'Synthetic import text', 'Synthetic share text']) expect(screen.getByText(body)).toBeOnTheScreen();
    expect(screen.getAllByText('Versión 1')).toHaveLength(3);
    for (const name of [RECORD, IMPORT, 'Compartir resultados con otra escuela']) expect(screen.queryByRole('checkbox', { name })).toBeNull();
    // Only the photo is optional and separate: one box for each swimmer, unchecked.
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    screen.getAllByRole('checkbox', { name: PHOTO }).forEach((box) => expect(box).not.toBeChecked());
    expect(screen.getByText('Ana M., Tomás P.', { exact: false })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continuar sin unirme' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
  });

  it('«Aceptar» joins and passes no photo when its box is not checked', async () => {
    const onAccept = jest.fn().mockResolvedValue(true);
    await render(<AuthorizationsScreen {...props({ join: { athletes: ['Ana M.'], onAccept, onDecline: jest.fn() } })} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Aceptar' }));

    await waitFor(() => expect(onAccept).toHaveBeenCalledWith([]));
  });

  it('«Aceptar» passes the photo of the swimmer whose box was checked, as the only optional authorization', async () => {
    const onAccept = jest.fn().mockResolvedValue(true);
    await render(<AuthorizationsScreen {...props({ athletes, join: { athletes: ['Ana M.'], onAccept, onDecline: jest.fn() } })} />);

    await fireEvent.press(screen.getByRole('checkbox', { name: PHOTO }));
    await fireEvent.press(screen.getByRole('button', { name: 'Aceptar' }));

    await waitFor(() => expect(onAccept).toHaveBeenCalledWith([{ athleteId: 'a1', text: texts.find((text) => text.purpose === 'show_photo') }]));
  });

  it('«Continuar sin unirme» declines and never accepts', async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn().mockResolvedValue(true);
    await render(<AuthorizationsScreen {...props({ join: { athletes: ['Ana M.'], onAccept, onDecline } })} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar sin unirme' }));

    await waitFor(() => expect(onDecline).toHaveBeenCalledWith([]));
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('a second press while the first is working does nothing', async () => {
    let release!: (done: boolean) => void;
    const onAccept = jest.fn(() => new Promise<boolean>((resolve) => (release = resolve)));
    await render(<AuthorizationsScreen {...props({ join: { athletes: ['Ana M.'], onAccept, onDecline: jest.fn() } })} />);

    // The first press waits for the answer, so neither press is awaited until it is released.
    await act(async () => {
      void fireEvent.press(screen.getByRole('button', { name: 'Aceptar' }));
      void fireEvent.press(screen.getByRole('button', { name: 'Aceptar' }));
    });
    await act(async () => release(true));

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('without an invitation it is the ordinary screen: one box per purpose and «Continuar»', async () => {
    await render(<AuthorizationsScreen {...props({ join: undefined })} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull();
  });
});

describe('AuthorizationsContainer: joining a school', () => {
  const token = 'f'.repeat(32);
  const two = [...athletes, { id: 'a2', name: 'Tomás P.' }];

  async function renderJoin({ draftToken = token as string | null, queued = ['a1', 'a2'], offline = false } = {}) {
    const drafts = createInMemoryRegistrationDraftRepository({ swimmer: 'child', firstName: '', lastName: '', email: '', ...(draftToken && { invitationToken: draftToken }) });
    const pending = createInMemoryPendingInvitationRepository();
    for (const athleteId of queued) await pending.add({ userId: 'guardian-1', token, athleteId });
    // Another account's entry and one of another token must stay as they are.
    await pending.add({ userId: 'guardian-2', token, athleteId: 'x1' });
    await pending.add({ userId: 'guardian-1', token: 'e'.repeat(32), athleteId: 'x2' });
    const invitations = createInMemoryInvitationRepository({ offline });
    const identityNumbers = createIdentityNumberHold();
    identityNumbers.put('a1', '987654321');
    const identityDocuments = createInMemoryIdentityDocumentRepository();
    let n = 0;
    const rendered = await renderContainer({
      mode: 'registration',
      athletes: two,
      drafts,
      pending,
      invitations,
      identityNumbers,
      identityDocuments,
      newId: () => `id-${++n}`,
    });
    return { ...rendered, drafts, pending, invitations, identityNumbers, identityDocuments };
  }

  it('names the swimmers who join and offers «Aceptar» and «Continuar sin unirme»', async () => {
    await renderJoin();

    expect(await screen.findByRole('button', { name: 'Aceptar' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continuar sin unirme' })).toBeOnTheScreen();
    expect(screen.getByText('Ana M., Tomás P.', { exact: false })).toBeOnTheScreen();
    expect(screen.getByText('Synthetic import text')).toBeOnTheScreen();
  });

  it('«Aceptar» stores the consent on each entry of the token, sends them, clears the draft and continues', async () => {
    const { pending, invitations, drafts, onDone } = await renderJoin();

    await fireEvent.press(await screen.findByRole('button', { name: 'Aceptar' }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(invitations.accepted.map((item) => item.athleteId)).toEqual(['a1', 'a2']);
    for (const item of invitations.accepted) {
      expect(item.token).toBe(token);
      expect(item.consent.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
      expect(item.consent.authorizations.map(({ purpose, textId }) => [purpose, textId])).toEqual([
        ['record_times', 't-record'],
        ['import_official_results', 't-import'],
        ['share_results_with_school', 't-share'],
      ]);
    }
    // Every authorization has its own id, so one swimmer's evidence never collides with another's.
    expect(new Set(invitations.accepted.flatMap((item) => item.consent.authorizations.map(({ id }) => id))).size).toBe(6);
    // What was sent leaves the queue; another account's entry and another token's stay.
    expect((await pending.list()).map((item) => item.athleteId)).toEqual(['x1', 'x2']);
    expect(await drafts.load()).toBeNull();
  });

  it('«Aceptar» writes no local authorization: the server rows arrive by sync, so nothing is counted twice', async () => {
    const { repository } = await renderJoin();

    await fireEvent.press(await screen.findByRole('button', { name: 'Aceptar' }));

    await waitFor(async () => expect(await repository.listAuthorizations('guardian-1', ['a1', 'a2'])).toEqual([]));
  });

  it('«Aceptar» sends the identity number, because the invitation accepts import_official_results', async () => {
    const { identityDocuments, identityNumbers, onDone } = await renderJoin();

    await fireEvent.press(await screen.findByRole('button', { name: 'Aceptar' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(identityDocuments.saved).toEqual([{ athleteId: 'a1', identityNumber: '987654321' }]);
    expect(identityNumbers.take('a1')).toBeUndefined();
  });

  it('«Aceptar» with the photo box checked also saves show_photo on the device, for that swimmer only', async () => {
    const { repository, onDone } = await renderJoin();

    await fireEvent.press((await screen.findAllByRole('checkbox', { name: PHOTO }))[0]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Aceptar' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const rows = await repository.listAuthorizations('guardian-1', ['a1', 'a2']);
    expect(rows.map((row) => [row.athleteId, row.purpose])).toEqual([['a1', 'show_photo']]);
  });

  it('without a network the entries keep their consent for the next run, and the registration still continues', async () => {
    const { pending, invitations, onDone } = await renderJoin({ offline: true });

    await fireEvent.press(await screen.findByRole('button', { name: 'Aceptar' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(invitations.accepted).toEqual([]);
    const waiting = (await pending.list()).filter((item) => item.token === token && item.userId === 'guardian-1');
    expect(waiting.map((item) => [item.athleteId, item.consent?.authorizations.length])).toEqual([
      ['a1', 3],
      ['a2', 3],
    ]);
  });

  it('«Continuar sin unirme» drops the entries of the token without calling the server, and drops the held numbers', async () => {
    const { pending, invitations, identityDocuments, identityNumbers, drafts, onDone } = await renderJoin();

    await fireEvent.press(await screen.findByRole('button', { name: 'Continuar sin unirme' }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(invitations.accepted).toEqual([]);
    expect((await pending.list()).map((item) => item.athleteId)).toEqual(['x1', 'x2']);
    expect(identityDocuments.saved).toEqual([]);
    expect(identityNumbers.take('a1')).toBeUndefined();
    expect(await drafts.load()).toBeNull();
  });

  it('without an invitation token in the draft it is the ordinary registration screen, and the queue is untouched', async () => {
    const { pending } = await renderJoin({ draftToken: null });

    expect(await screen.findByRole('button', { name: 'Continuar' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    expect(await pending.list()).toHaveLength(4);
  });

  it('with a token but nothing queued for it, it is the ordinary registration screen', async () => {
    await renderJoin({ queued: [] });

    expect(await screen.findByRole('button', { name: 'Continuar' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBeNull();
  });
});
