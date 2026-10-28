import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '../../../core/theme';
import { accountsFixture as fx } from '../__fixtures__/accounts';
import { AccountDetailsScreen, type AccountDetailsScreenProps } from '../screens/AccountDetailsScreen';

const empty = { firstName: '', lastName: '', email: '', code: '' };
const filled = { firstName: fx.person.firstName, lastName: fx.person.lastName, email: fx.person.email, code: '' };

const CODE_MISMATCH = 'Ese código no coincide. Revisa el último mensaje o pide uno nuevo.';
const EMAIL_IN_USE = 'Ya hay una cuenta con este correo. Inicia sesión';

function makeCallbacks() {
  return {
    onGoogle: jest.fn(),
    onMicrosoft: jest.fn(),
    onRequestCode: jest.fn(),
    onSubmitCode: jest.fn(),
    onBack: jest.fn(),
    onSignIn: jest.fn(),
    onChange: jest.fn(),
  };
}

async function renderScreen(props: Partial<AccountDetailsScreenProps> = {}) {
  const callbacks = makeCallbacks();
  await render(<AccountDetailsScreen step={2} total={4} values={empty} providers={['google', 'microsoft']} {...callbacks} {...props} />);
  return callbacks;
}

const buttonNames = () => screen.getAllByRole('button').map((button) => button.props.accessibilityLabel);
const backgroundOf = (name: string) =>
  StyleSheet.flatten(screen.getByRole('button', { name }).props.style).backgroundColor;

describe('AccountDetailsScreen states', () => {
  it('initial: providers first, then the code option with first name, last name and email', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Crear cuenta' })).toBeOnTheScreen();
    expect(screen.getByText('Paso 2 de 4')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nombre')).toBeOnTheScreen();
    expect(screen.getByLabelText('Apellido')).toBeOnTheScreen();
    expect(screen.getByLabelText('Correo electrónico')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Celular')).toBeNull();
    expect(screen.getByText('o con un código por correo')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continuar con Microsoft' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Enviarme un código' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Código de 6 dígitos')).toBeNull();
    expect(screen.queryByTestId('banner')).toBeNull();
  });

  it('codeSent: asks for the 6-digit code that was sent to the email', async () => {
    await renderScreen({ values: filled, codeSent: true });

    const code = screen.getByLabelText('Código de 6 dígitos');
    expect(code.props.accessibilityHint).toBe(`Te enviamos un código de 6 dígitos a ${fx.person.email}.`);
    expect(code.props.keyboardType).toBe('number-pad');
    // No maxLength: the platform would cut a pasted "123 456" before the separators are stripped.
    expect(code.props.maxLength).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Verificar y continuar' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pedir un código nuevo' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Enviarme un código' })).toBeNull();
  });

  it('codeMismatch: shows the exact message on the code field', async () => {
    await renderScreen({
      values: { ...filled, code: fx.wrongCode },
      codeSent: true,
      errors: { code: 'mismatch' },
    });

    expect(screen.getByText(CODE_MISMATCH)).toBeOnTheScreen();
    expect(screen.getByLabelText('Código de 6 dígitos').props.accessibilityHint).toBe(CODE_MISMATCH);
  });

  it('emailInUse: shows the exact message and a way to the sign-in screen', async () => {
    const { onSignIn } = await renderScreen({ values: filled, errors: { email: 'in_use' } });

    expect(screen.getByText(EMAIL_IN_USE)).toBeOnTheScreen();
    expect(screen.getByLabelText('Correo electrónico').props.accessibilityHint).toBe(EMAIL_IN_USE);
    await fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('code field: separators are stripped and the code is cut to 6 digits', async () => {
    const { onChange } = await renderScreen({ values: filled, codeSent: true });
    const field = screen.getByLabelText('Código de 6 dígitos');
    expect(field.props.maxLength).toBeUndefined();

    await fireEvent.changeText(field, '123 456');
    expect(onChange).toHaveBeenLastCalledWith('code', '123456');
    await fireEvent.changeText(field, '1234567');
    expect(onChange).toHaveBeenLastCalledWith('code', '123456');
  });

  it('offline: says verifying needs signal, keeps what was typed and marks network buttons', async () => {
    await renderScreen({ values: filled, codeSent: true, offline: true });

    expect(screen.getByTestId('banner')).toHaveTextContent(
      'Estás sin conexión. Guardamos lo que escribiste; verificar el código necesita señal.',
    );
    expect(screen.getByDisplayValue(fx.person.firstName)).toBeOnTheScreen();
    expect(screen.getByDisplayValue(fx.person.lastName)).toBeOnTheScreen();
    expect(screen.getByDisplayValue(fx.person.email)).toBeOnTheScreen();
    for (const name of [
      'Continuar con Google · Necesitas señal',
      'Continuar con Microsoft · Necesitas señal',
      'Verificar y continuar · Necesitas señal',
      'Pedir un código nuevo · Necesitas señal',
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
    }
    expect(screen.getByText('Verificar y continuar · Necesitas señal')).toBeOnTheScreen();
    expect(screen.getByText('Pedir un código nuevo · Necesitas señal')).toBeOnTheScreen();
    expect(screen.getByText('Continuar con Google · Necesitas señal')).toBeOnTheScreen();
    expect(screen.getByText('Continuar con Microsoft · Necesitas señal')).toBeOnTheScreen();
  });

  it('offline before the code: the code request needs signal too', async () => {
    await renderScreen({ values: filled, offline: true });

    expect(screen.getByRole('button', { name: 'Enviarme un código · Necesitas señal' })).toBeDisabled();
    expect(screen.getByText('Enviarme un código · Necesitas señal')).toBeOnTheScreen();
  });

  it('sending: the code button shows its loading label', async () => {
    await renderScreen({ values: filled, busy: 'sending' });

    expect(screen.getByText('Enviando código…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Enviarme un código' })).toBeBusy();
  });

  it('verifying: the verify button shows its loading label', async () => {
    await renderScreen({ values: { ...filled, code: fx.wrongCode }, codeSent: true, busy: 'verifying' });

    expect(screen.getByText('Verificando…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Verificar y continuar' })).toBeBusy();
  });

  it('invitation: the school and the group come filled in and only confirming is left', async () => {
    await renderScreen({ values: filled, invitation: fx.invitation });

    expect(screen.getAllByText(fx.invitation.school, { exact: true })).toHaveLength(2);
    expect(screen.getByTestId('banner')).toHaveTextContent(
      'Te invitó Escuela Delfines al grupo Infantil B. Revisa tus datos y confirma.',
    );
  });
});

describe('AccountDetailsScreen registration states', () => {
  it('required and invalid: each field shows its message through the error hint', async () => {
    await renderScreen({ errors: { firstName: 'required', lastName: 'required', email: 'invalid' } });

    expect(screen.getByLabelText('Nombre').props.accessibilityHint).toBe('Escribe tu nombre.');
    expect(screen.getByLabelText('Apellido').props.accessibilityHint).toBe('Escribe tu apellido.');
    expect(screen.getByLabelText('Correo electrónico').props.accessibilityHint).toBe(
      'Revisa el correo: debe verse como nombre@dominio.com.',
    );
    await renderScreen({ errors: { email: 'required' } });
    expect(screen.getAllByText('Escribe tu correo.').length).toBeGreaterThan(0);
  });

  it('providers off: no Google, Microsoft or divider, and the callbacks may be omitted', async () => {
    await render(
      <AccountDetailsScreen
        step={2}
        total={3}
        values={empty}
        providers={[]}
        onChange={jest.fn()}
        onRequestCode={jest.fn()}
        onSubmitCode={jest.fn()}
        onSignIn={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Continuar con Google' })).toBeNull();
    expect(screen.queryByText('o con un código por correo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enviarme un código' })).toBeOnTheScreen();
  });

  it('providers omitted: the buttons stay hidden, and the compiler asks for the prop', async () => {
    await render(
      // @ts-expect-error providers is required: a consumer that forgets it must not show the buttons by accident.
      <AccountDetailsScreen
        step={2}
        total={3}
        values={empty}
        onChange={jest.fn()}
        onRequestCode={jest.fn()}
        onSubmitCode={jest.fn()}
        onSignIn={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Continuar con Google' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continuar con Microsoft' })).toBeNull();
  });

  it('offline failure: explains the missing signal and retries', async () => {
    const onRetry = jest.fn();
    await renderScreen({ values: filled, failure: 'offline', onRetry });

    expect(screen.getByText('Sin señal')).toBeOnTheScreen();
    expect(
      screen.getByText('Guardamos lo que escribiste. Pedir y verificar el código necesita señal.'),
    ).toBeOnTheScreen();
    expect(screen.getByDisplayValue(fx.person.firstName)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['request_failed', 'No pudimos enviar el código'],
    ['verify_failed', 'No pudimos revisar el código. Inténtalo de nuevo.'],
  ] as const)('%s failure: shows its message and a retry action', async (failure, title) => {
    const onRetry = jest.fn();
    await renderScreen({ values: filled, failure, onRetry });

    expect(screen.getByText(title)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('AccountDetailsScreen rules', () => {
  it('puts Google and Microsoft before the code option, and the code option is not primary', async () => {
    await renderScreen({ values: filled });

    const names = buttonNames();
    const code = names.indexOf('Enviarme un código');
    expect(names.indexOf('Continuar con Google')).toBeLessThan(code);
    expect(names.indexOf('Continuar con Microsoft')).toBeLessThan(code);
    expect(backgroundOf('Enviarme un código')).not.toBe(colors.light.action);
    expect(backgroundOf('Continuar con Google')).not.toBe(colors.light.action);
  });

  it.each([
    ['initial', {}],
    ['codeSent', { codeSent: true }],
    ['offline', { offline: true, codeSent: true }],
    ['emailInUse', { errors: { email: 'in_use' as const } }],
  ])('%s has no password field', async (_name, props) => {
    await renderScreen(props);

    const inputs = screen.container.queryAll((node) => node.type === 'TextInput');
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((input) => !input.props.secureTextEntry)).toBe(true);
  });

  it('keeps every field readable at large text: a scroll view and no clipping', async () => {
    await renderScreen({ values: filled, codeSent: true });

    expect(screen.container.queryAll((node) => node.type === 'RCTScrollView').length).toBeGreaterThan(0);
    for (const text of screen.container.queryAll((node) => node.type === 'Text')) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.allowFontScaling).not.toBe(false);
    }
  });
});

describe('AccountDetailsScreen callbacks', () => {
  it('calls the provider and code callbacks', async () => {
    const callbacks = await renderScreen({ values: filled });

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar con Google' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar con Microsoft' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enviarme un código' }));

    expect(callbacks.onGoogle).toHaveBeenCalledTimes(1);
    expect(callbacks.onMicrosoft).toHaveBeenCalledTimes(1);
    expect(callbacks.onRequestCode).toHaveBeenCalledTimes(1);
  });

  it('submits the code, asks for a new one and goes back', async () => {
    const callbacks = await renderScreen({ values: { ...filled, code: '123456' }, codeSent: true });

    await fireEvent.press(screen.getByRole('button', { name: 'Verificar y continuar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Pedir un código nuevo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(callbacks.onSubmitCode).toHaveBeenCalledTimes(1);
    expect(callbacks.onRequestCode).toHaveBeenCalledTimes(1);
    expect(callbacks.onBack).toHaveBeenCalledTimes(1);
  });

  it('reports each edited field, keeping only digits in the code', async () => {
    const { onChange } = await renderScreen({ codeSent: true });

    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Camila');
    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'c@example.test');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), 'Rojas');
    await fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '12a3 4567');

    expect(onChange).toHaveBeenNthCalledWith(1, 'firstName', 'Camila');
    expect(onChange).toHaveBeenNthCalledWith(2, 'email', 'c@example.test');
    expect(onChange).toHaveBeenNthCalledWith(3, 'lastName', 'Rojas');
    expect(onChange).toHaveBeenNthCalledWith(4, 'code', '123456');
  });
});
