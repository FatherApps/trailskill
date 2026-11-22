import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryIdentityDocumentRepository } from '../data/identityDocuments';
import { AthleteIdentityNumberContainer } from '../screens/AthleteIdentityNumberContainer';

jest.mock('../../../core/sync', () => ({ supabase: {} }));

// Invented number: never a real document.
const NUMBER = 'ZZ1234567';

type Repository = ReturnType<typeof createInMemoryIdentityDocumentRepository>;

async function show(options: { authorized?: boolean; online?: boolean; repository?: Repository } = {}) {
  const repository = options.repository ?? createInMemoryIdentityDocumentRepository();
  const onGoToAuthorizations = jest.fn();
  await render(
    <AthleteIdentityNumberContainer
      athleteId="a1"
      repository={repository}
      authorized={options.authorized ?? true}
      online={options.online ?? true}
      onGoToAuthorizations={onGoToAuthorizations}
    />,
  );
  return { repository, onGoToAuthorizations };
}

const typeNumber = (text: string) => fireEvent.changeText(screen.getByLabelText('Número nuevo'), text);

describe('AthleteIdentityNumberContainer', () => {
  it('says there is no number yet when none is saved', async () => {
    await show();
    expect(await screen.findByText('Todavía no hay un número de identificación guardado.')).toBeTruthy();
  });

  it('shows only how a saved number ends', async () => {
    const repository = createInMemoryIdentityDocumentRepository();
    repository.hints.a1 = { present: true, lastThree: '567' };
    await show({ repository });
    expect(await screen.findByText('Hay un número de identificación guardado, termina en 567.')).toBeTruthy();
  });

  it('says a number is saved without its ending when the server gives none', async () => {
    const repository = createInMemoryIdentityDocumentRepository();
    repository.hints.a1 = { present: true, lastThree: null };
    await show({ repository });
    expect(await screen.findByText('Hay un número de identificación guardado.')).toBeTruthy();
  });

  it('saves a valid number, empties the field and reloads the hint', async () => {
    const { repository } = await show();
    await screen.findByText('Todavía no hay un número de identificación guardado.');
    await typeNumber(' zz-123.4567 ');
    // Spaces, dots and hyphens are not part of the number.
    repository.hints.a1 = { present: true, lastThree: '567' };
    await fireEvent.press(screen.getByText('Guardar número'));
    expect(await screen.findByText('Hay un número de identificación guardado, termina en 567.')).toBeTruthy();
    expect(repository.saved).toEqual([{ athleteId: 'a1', identityNumber: 'zz1234567' }]);
    expect(screen.getByLabelText('Número nuevo').props.value).toBe('');
  });

  it('never cuts a number written with many separators: it saves all of it, or rejects it', async () => {
    const { repository } = await show();
    await screen.findByText('Todavía no hay un número de identificación guardado.');
    // 20 characters and 19 hyphens: far longer than the 20 a number may have, yet valid once the separators go.
    await typeNumber('1-2-3-4-5-6-7-8-9-0-A-B-C-D-E-F-G-H-I-J');
    expect(screen.getByLabelText('Número nuevo').props.value).toBe('1-2-3-4-5-6-7-8-9-0-A-B-C-D-E-F-G-H-I-J');
    await fireEvent.press(screen.getByText('Guardar número'));
    expect(repository.saved).toEqual([{ athleteId: 'a1', identityNumber: '1234567890ABCDEFGHIJ' }]);
    // A number really too long is rejected, never saved cut to 20.
    await typeNumber('1-2-3-4-5-6-7-8-9-0-A-B-C-D-E-F-G-H-I-J-K');
    await fireEvent.press(screen.getByText('Guardar número'));
    expect(screen.getByText('Usa solo letras y números, hasta 20.')).toBeTruthy();
    expect(repository.saved).toHaveLength(1);
  });

  it('turns autofill off for the identity field', async () => {
    await show();
    await screen.findByText('Todavía no hay un número de identificación guardado.');
    const field = screen.getByLabelText('Número nuevo');
    expect(field.props.autoComplete).toBe('off');
    expect(field.props.importantForAutofill).toBe('no');
    // A cap on the raw text would silently cut a number written with separators.
    expect(field.props.maxLength).toBeUndefined();
  });

  it('shows the error for an invalid number and does not save', async () => {
    const { repository } = await show();
    await screen.findByText('Todavía no hay un número de identificación guardado.');
    await typeNumber('12_34');
    await fireEvent.press(screen.getByText('Guardar número'));
    expect(screen.getByText('Usa solo letras y números, hasta 20.')).toBeTruthy();
    expect(repository.saved).toEqual([]);
  });

  it('does not save an empty field', async () => {
    const { repository } = await show();
    await screen.findByText('Todavía no hay un número de identificación guardado.');
    await fireEvent.press(screen.getByText('Guardar número'));
    expect(screen.getByText('Usa solo letras y números, hasta 20.')).toBeTruthy();
    expect(repository.saved).toEqual([]);
  });

  it('is read-only without the authorization, says why and links to Autorizaciones', async () => {
    const repository = createInMemoryIdentityDocumentRepository();
    repository.hints.a1 = { present: true, lastThree: '567' };
    const { onGoToAuthorizations } = await show({ authorized: false, repository });
    expect(await screen.findByText('Hay un número de identificación guardado, termina en 567.')).toBeTruthy();
    expect(screen.getByText(/solo se guarda para la importación de resultados oficiales/)).toBeTruthy();
    expect(screen.queryByLabelText('Número nuevo')).toBeNull();
    expect(screen.queryByText('Guardar número')).toBeNull();
    await fireEvent.press(screen.getByText('Ir a Autorizaciones'));
    expect(onGoToAuthorizations).toHaveBeenCalledTimes(1);
  });

  it('is read-only without signal and cannot save', async () => {
    const { repository } = await show({ online: false });
    expect(screen.getByText('Sin conexión: con señal podrás ver y cambiar el número de identificación.')).toBeTruthy();
    expect(screen.queryByLabelText('Número nuevo')).toBeNull();
    expect(screen.queryByText('Guardar número')).toBeNull();
    expect(repository.saved).toEqual([]);
  });

  it('offers to retry when the hint cannot be read, and never a blind field', async () => {
    const repository = createInMemoryIdentityDocumentRepository();
    repository.failing = true;
    await show({ repository });
    expect(await screen.findByText('No pudimos leer el número de identificación.')).toBeTruthy();
    expect(screen.queryByLabelText('Número nuevo')).toBeNull();
    repository.failing = false;
    await fireEvent.press(screen.getByText('Intentar de nuevo'));
    expect(await screen.findByLabelText('Número nuevo')).toBeTruthy();
  });

  it('shows a clear error when the save fails, keeps the field, and never reveals the number', async () => {
    const repository = createInMemoryIdentityDocumentRepository();
    // A bad server error that carries the number: nothing of it may reach the screen or the logs.
    repository.save = async () => {
      throw new Error(`Saving the identity number failed (${NUMBER})`);
    };
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const info = jest.spyOn(console, 'log').mockImplementation(() => {});
    await show({ repository });
    await screen.findByText('Todavía no hay un número de identificación guardado.');
    await typeNumber(NUMBER);
    await fireEvent.press(screen.getByText('Guardar número'));
    expect(await screen.findByText('No pudimos guardar el número. Revisa la señal e inténtalo de nuevo.')).toBeTruthy();
    // The field keeps what the person typed so they can try again, but no other text shows it.
    expect(screen.getByLabelText('Número nuevo').props.value).toBe(NUMBER);
    expect(screen.queryByText(new RegExp(NUMBER))).toBeNull();
    for (const spy of [log, warn, info]) expect(JSON.stringify(spy.mock.calls)).not.toContain(NUMBER);
    jest.restoreAllMocks();
  });
});
