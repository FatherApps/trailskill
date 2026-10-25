import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '../../../core/theme';
import { accountsFixture as fx } from '../__fixtures__/accounts';
import { SignInScreen, type SignInScreenProps } from '../screens/SignInScreen';

const CODE_MISMATCH = 'Ese código no coincide. Revisa el último mensaje o pide uno nuevo.';
const typed = { email: fx.person.email, code: '' };

function makeCallbacks() {
  return {
    onGoogle: jest.fn(),
    onMicrosoft: jest.fn(),
    onRequestCode: jest.fn(),
    onSubmitCode: jest.fn(),
    onBack: jest.fn(),
    onChange: jest.fn(),
  };
}

async function renderScreen(props: Partial<SignInScreenProps> = {}) {
  const callbacks = makeCallbacks();
  await render(<SignInScreen values={{ email: '', code: '' }} {...callbacks} {...props} />);
  return callbacks;
}

const buttonNames = () => screen.getAllByRole('button').map((button) => button.props.accessibilityLabel);
const backgroundOf = (name: string) =>
  StyleSheet.flatten(screen.getByRole('button', { name }).props.style).backgroundColor;

describe('SignInScreen states', () => {
  it('initial: providers first, then the email with a code', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Ingresa a TrailSkill' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continuar con Microsoft' })).toBeOnTheScreen();
    expect(screen.getByText('o con un código por correo')).toBeOnTheScreen();
    expect(screen.getByLabelText('Correo electrónico')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Enviar código' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Código de 6 dígitos')).toBeNull();
    expect(screen.queryByLabelText('Nombre')).toBeNull();
    expect(screen.queryByTestId('banner')).toBeNull();
  });

  it('codeSent: asks for the code sent to the email', async () => {
    await renderScreen({ values: typed, codeSent: true });

    expect(screen.getByLabelText('Código de 6 dígitos').props.accessibilityHint).toBe(
      `Te enviamos un código de 6 dígitos a ${fx.person.email}.`,
    );
    expect(screen.getByRole('button', { name: 'Verificar y continuar' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pedir un código nuevo' })).toBeOnTheScreen();
  });

  it('codeMismatch: shows the exact message', async () => {
    await renderScreen({ values: { ...typed, code: fx.wrongCode }, codeSent: true, errors: { code: 'mismatch' } });

    expect(screen.getByText(CODE_MISMATCH)).toBeOnTheScreen();
  });

  it('sending: the code button shows its loading label', async () => {
    await renderScreen({ values: typed, busy: 'sending' });

    expect(screen.getByText('Enviando código…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Enviar código' })).toBeBusy();
  });

  it('offline: says verifying needs signal, keeps the email and marks network buttons', async () => {
    await renderScreen({ values: typed, codeSent: true, offline: true });

    expect(screen.getByTestId('banner')).toHaveTextContent(
      'Estás sin conexión. Guardamos lo que escribiste; verificar el código necesita señal.',
    );
    expect(screen.getByDisplayValue(fx.person.email)).toBeOnTheScreen();
    for (const name of [
      'Continuar con Google',
      'Continuar con Microsoft',
      'Verificar y continuar',
      'Pedir un código nuevo',
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button.props.accessibilityHint).toBe('Necesitas señal');
    }
  });
});

describe('SignInScreen rules', () => {
  it('puts Google and Microsoft before the code option, and the code option is not primary', async () => {
    await renderScreen({ values: typed });

    const names = buttonNames();
    const code = names.indexOf('Enviar código');
    expect(names.indexOf('Continuar con Google')).toBeLessThan(code);
    expect(names.indexOf('Continuar con Microsoft')).toBeLessThan(code);
    expect(backgroundOf('Enviar código')).not.toBe(colors.light.action);
  });

  it.each([
    ['initial', {}],
    ['codeSent', { codeSent: true }],
    ['offline', { offline: true, codeSent: true }],
  ])('%s has no password field', async (_name, props) => {
    await renderScreen(props);

    const inputs = screen.container.queryAll((node) => node.type === 'TextInput');
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((input) => !input.props.secureTextEntry)).toBe(true);
  });
});

describe('SignInScreen callbacks', () => {
  it('calls each control callback', async () => {
    const callbacks = await renderScreen({ values: { ...typed, code: '123456' }, codeSent: true });

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar con Google' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar con Microsoft' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Verificar y continuar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Pedir un código nuevo' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(callbacks.onGoogle).toHaveBeenCalledTimes(1);
    expect(callbacks.onMicrosoft).toHaveBeenCalledTimes(1);
    expect(callbacks.onSubmitCode).toHaveBeenCalledTimes(1);
    expect(callbacks.onRequestCode).toHaveBeenCalledTimes(1);
    expect(callbacks.onBack).toHaveBeenCalledTimes(1);
  });

  it('requests the code and reports the edited email and code', async () => {
    const callbacks = await renderScreen({ values: typed });
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar código' }));
    expect(callbacks.onRequestCode).toHaveBeenCalledTimes(1);

    await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'otra@example.test');
    expect(callbacks.onChange).toHaveBeenLastCalledWith('email', 'otra@example.test');
  });
});
