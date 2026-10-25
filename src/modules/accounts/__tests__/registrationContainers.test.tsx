import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CodeMismatchError } from '../../../core/session';
import { accountsFixture as fx } from '../__fixtures__/accounts';
import { createInMemoryRegistrationDraftRepository } from '../data/registrationDraft';
import { AccountDetailsContainer } from '../screens/AccountDetailsContainer';
import { WhoSwimsContainer } from '../screens/WhoSwimsContainer';

// The session module reaches the sync layer, which is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ db: {}, supabase: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

const typed = { firstName: fx.person.firstName, lastName: fx.person.lastName, email: fx.person.email };

async function renderDetails(
  drafts = createInMemoryRegistrationDraftRepository(),
  session: { requestCode?: jest.Mock; verifyCode?: jest.Mock } = {},
) {
  const requestCode = session.requestCode ?? jest.fn().mockResolvedValue(undefined);
  const verifyCode = session.verifyCode ?? jest.fn().mockResolvedValue(undefined);
  const view = await render(
    <AccountDetailsContainer drafts={drafts} requestCode={requestCode} verifyCode={verifyCode} onBack={jest.fn()} onSignIn={jest.fn()} />,
  );
  await screen.findByLabelText('Nombre');
  return { drafts, requestCode, verifyCode, view };
}

async function fillIn() {
  await fireEvent.changeText(screen.getByLabelText('Nombre'), typed.firstName);
  await fireEvent.changeText(screen.getByLabelText('Apellido'), typed.lastName);
  await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), typed.email);
}

describe('AccountDetailsContainer', () => {
  it('keeps what was typed after the screen is closed and opened again', async () => {
    const { drafts, view } = await renderDetails();
    await fillIn();
    await view.unmount();

    await renderDetails(drafts);

    expect(screen.getByDisplayValue(typed.firstName)).toBeOnTheScreen();
    expect(screen.getByDisplayValue(typed.lastName)).toBeOnTheScreen();
    expect(screen.getByDisplayValue(typed.email)).toBeOnTheScreen();
  });

  it('shows the required errors on the fields and asks for no code', async () => {
    const { requestCode } = await renderDetails();

    await fireEvent.press(screen.getByRole('button', { name: 'Enviarme un código' }));

    expect(screen.getByLabelText('Nombre').props.accessibilityHint).toBe('Escribe tu nombre.');
    expect(screen.getByLabelText('Apellido').props.accessibilityHint).toBe('Escribe tu apellido.');
    expect(screen.getByLabelText('Correo electrónico').props.accessibilityHint).toBe('Escribe tu correo.');
    expect(requestCode).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Camila');
    expect(screen.getByLabelText('Nombre').props.accessibilityHint).toBeUndefined();
  });

  it('rejects an email that does not look like one', async () => {
    const { requestCode } = await renderDetails();
    await fillIn();
    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'camila@');

    await fireEvent.press(screen.getByRole('button', { name: 'Enviarme un código' }));

    expect(screen.getByLabelText('Correo electrónico').props.accessibilityHint).toBe(
      'Revisa el correo: debe verse como nombre@dominio.com.',
    );
    expect(requestCode).not.toHaveBeenCalled();
  });

  it('asks for the code creating the account, then asks for the code field', async () => {
    const { requestCode } = await renderDetails();
    await fillIn();

    await fireEvent.press(screen.getByRole('button', { name: 'Enviarme un código' }));

    expect(requestCode).toHaveBeenCalledWith(typed.email, { createUser: true });
    expect(await screen.findByLabelText('Código de 6 dígitos')).toBeOnTheScreen();
    // Providers wait for #84 and #85.
    expect(screen.queryByRole('button', { name: 'Continuar con Google' })).toBeNull();
  });

  it('offline while asking for the code: explains it, keeps the draft and retries', async () => {
    const requestCode = jest
      .fn()
      .mockRejectedValueOnce(new AuthRetryableFetchError('Network request failed', 0))
      .mockResolvedValue(undefined);
    const { drafts } = await renderDetails(undefined, { requestCode });
    await fillIn();

    await fireEvent.press(screen.getByRole('button', { name: 'Enviarme un código' }));

    expect(await screen.findByText('Sin señal')).toBeOnTheScreen();
    expect(screen.getByDisplayValue(typed.firstName)).toBeOnTheScreen();
    expect(screen.getByDisplayValue(typed.email)).toBeOnTheScreen();
    expect(await drafts.load()).toMatchObject(typed);

    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByLabelText('Código de 6 dígitos')).toBeOnTheScreen();
    expect(screen.queryByText('Sin señal')).toBeNull();
    expect(requestCode).toHaveBeenCalledTimes(2);
  });

  it('any other failure while asking for the code shows the request error', async () => {
    await renderDetails(undefined, { requestCode: jest.fn().mockRejectedValue(new Error('boom')) });
    await fillIn();

    await fireEvent.press(screen.getByRole('button', { name: 'Enviarme un código' }));

    expect(await screen.findByText('No pudimos enviar el código')).toBeOnTheScreen();
  });

  it('wrong code: shows the mismatch message and keeps the draft unchanged', async () => {
    const verifyCode = jest.fn().mockRejectedValue(new CodeMismatchError());
    const { drafts } = await renderDetails(undefined, { verifyCode });
    await fillIn();
    const before = await drafts.load();
    await fireEvent.press(screen.getByRole('button', { name: 'Enviarme un código' }));
    await fireEvent.changeText(await screen.findByLabelText('Código de 6 dígitos'), fx.wrongCode);

    await fireEvent.press(screen.getByRole('button', { name: 'Verificar y continuar' }));

    expect(verifyCode).toHaveBeenCalledWith(typed.email, fx.wrongCode);
    expect(
      await screen.findAllByText('Ese código no coincide. Revisa el último mensaje o pide uno nuevo.'),
    ).not.toHaveLength(0);
    expect(await drafts.load()).toEqual(before);
  });

  it('offline while verifying: explains it and retries the verification', async () => {
    const verifyCode = jest
      .fn()
      .mockRejectedValueOnce(new AuthRetryableFetchError('Network request failed', 0))
      .mockResolvedValue(undefined);
    await renderDetails(undefined, { verifyCode });
    await fillIn();
    await fireEvent.press(screen.getByRole('button', { name: 'Enviarme un código' }));
    await fireEvent.changeText(await screen.findByLabelText('Código de 6 dígitos'), '123456');

    await fireEvent.press(screen.getByRole('button', { name: 'Verificar y continuar' }));
    await screen.findByText('Sin señal');
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    await waitFor(() => expect(verifyCode).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Sin señal')).toBeNull();
  });

  it('changing the email after the code was sent asks for a new code', async () => {
    await renderDetails();
    await fillIn();
    await fireEvent.press(screen.getByRole('button', { name: 'Enviarme un código' }));
    await screen.findByLabelText('Código de 6 dígitos');

    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'otra@example.test');

    expect(screen.queryByLabelText('Código de 6 dígitos')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enviarme un código' })).toBeOnTheScreen();
  });

  it('counts three steps for an adult and four for a child', async () => {
    await renderDetails(createInMemoryRegistrationDraftRepository({ ...typed, swimmer: 'adult' }));
    expect(screen.getByText('Paso 2 de 3')).toBeOnTheScreen();
  });

  it('counts four steps when the swimmer is a child', async () => {
    await renderDetails(createInMemoryRegistrationDraftRepository({ ...typed, swimmer: 'child' }));
    expect(screen.getByText('Paso 2 de 4')).toBeOnTheScreen();
  });
});

describe('WhoSwimsContainer', () => {
  it('saves the choice in the draft, continues, and shows it chosen when opened again', async () => {
    const drafts = createInMemoryRegistrationDraftRepository();
    const onContinue = jest.fn();
    const view = await render(<WhoSwimsContainer drafts={drafts} onContinue={onContinue} onBack={jest.fn()} />);

    await fireEvent.press(await screen.findByRole('radio', { name: /^Yo,/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(onContinue).toHaveBeenCalledWith('adult'));
    expect(await drafts.load()).toMatchObject({ swimmer: 'adult' });

    await view.unmount();
    await render(<WhoSwimsContainer drafts={drafts} onContinue={onContinue} onBack={jest.fn()} />);
    expect(await screen.findByRole('radio', { name: /^Yo,/ })).toBeChecked();
  });

  it('keeps the names already typed when the choice changes', async () => {
    const drafts = createInMemoryRegistrationDraftRepository({ ...typed, swimmer: 'child' });
    await render(<WhoSwimsContainer drafts={drafts} onContinue={jest.fn()} onBack={jest.fn()} />);

    await fireEvent.press(await screen.findByRole('radio', { name: /^Yo,/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(async () => expect(await drafts.load()).toEqual({ ...typed, swimmer: 'adult' }));
  });

  it('continues even when the draft cannot be saved', async () => {
    const drafts = { ...createInMemoryRegistrationDraftRepository(), save: jest.fn().mockRejectedValue(new Error('disk')) };
    const onContinue = jest.fn();
    await render(<WhoSwimsContainer drafts={drafts} onContinue={onContinue} onBack={jest.fn()} />);

    await fireEvent.press(await screen.findByRole('radio', { name: /^Mi hijo/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(onContinue).toHaveBeenCalledWith('child'));
  });
});
