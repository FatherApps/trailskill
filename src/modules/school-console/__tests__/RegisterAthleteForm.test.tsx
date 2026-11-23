import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { schoolNameFixture } from '../__fixtures__/athletes';
import { RegisterAthleteForm, type RegisterAthleteFormProps } from '../components/RegisterAthleteForm';

const link = { link: 'swimcro://claim/abc123', expiresAt: '2026-12-06T10:00:00.000Z' };

const open = async (extra: Partial<RegisterAthleteFormProps> = {}) => {
  const props = {
    schoolName: schoolNameFixture,
    onSubmit: jest.fn().mockResolvedValue(link),
    share: jest.fn().mockResolvedValue(undefined),
    onClose: jest.fn(),
    ...extra,
  };
  await render(<RegisterAthleteForm {...props} />);
  return props;
};

const fill = async () => {
  await fireEvent.changeText(screen.getByLabelText('Nombre'), ' Lucía ');
  await fireEvent.changeText(screen.getByLabelText('Apellido'), ' Ramírez ');
};
const declare = () => fireEvent.press(screen.getByRole('checkbox'));
const submit = () => fireEvent.press(screen.getByRole('button', { name: /^Dar de alta/ }));

describe('RegisterAthleteForm', () => {
  it('does not register without the declaration, however complete the names are', async () => {
    const { onSubmit } = await open();
    await fill();

    expect(screen.getByRole('checkbox')).not.toBeChecked();
    await submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Dar de alta/ })).toBeDisabled();
  });

  it('does not register with the declaration but a missing name', async () => {
    const { onSubmit } = await open();
    await declare();
    await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Lucía');
    await fireEvent.changeText(screen.getByLabelText('Apellido'), '   ');

    await submit();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('never starts with the declaration checked', async () => {
    await open();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('registers the trimmed names once the declaration is checked, then shows the link to share', async () => {
    const { onSubmit, share, onClose } = await open();
    await fill();
    await declare();

    await submit();

    expect(onSubmit).toHaveBeenCalledWith({ firstName: 'Lucía', lastName: 'Ramírez' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Lucía Ramírez quedó registrado.')).toBeOnTheScreen();
    expect(screen.getByText('swimcro://claim/abc123')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Nombre')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir enlace' }));
    expect(share).toHaveBeenCalledTimes(1);
    const message = (share as jest.Mock).mock.calls[0][0] as string;
    expect(message).toContain(schoolNameFixture);
    expect(message).toContain('Lucía Ramírez');
    expect(message).toContain('swimcro://claim/abc123');
    expect(message).toContain('6 de diciembre de 2026');

    await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cannot be sent twice while the first call is running', async () => {
    let finish: (value: typeof link) => void = () => {};
    const onSubmit = jest.fn(() => new Promise<typeof link>((resolve) => (finish = resolve)));
    await open({ onSubmit });
    await fill();
    await declare();

    await submit();
    await submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => finish(link));
  });

  it.each([
    ['not_allowed', 'Solo un administrador activo de la escuela puede dar de alta a un nadador.'],
    ['invalid', 'Revisa los nombres: cada uno puede tener hasta 100 caracteres.'],
    ['network down', 'No pudimos dar de alta al nadador. Inténtalo de nuevo.'],
  ])('shows the text of the error %p and keeps what was typed', async (code, text) => {
    await open({ onSubmit: jest.fn().mockRejectedValue(new Error(code)) });
    await fill();
    await declare();

    await submit();

    expect(screen.getByText(text)).toBeOnTheScreen();
    expect(screen.getByLabelText('Nombre').props.value).toBe(' Lucía ');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('says that registering needs a connection and does not send while offline', async () => {
    const { onSubmit } = await open({ offline: true });
    await fill();
    await declare();

    await submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Dar de alta · Necesita conexión' })).toBeOnTheScreen();
  });

  it('keeps the link on the screen when the system share sheet fails', async () => {
    await open({ share: jest.fn().mockRejectedValue(new Error('no share')) });
    await fill();
    await declare();
    await submit();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir enlace' }));

    expect(screen.getByText('No pudimos compartir el enlace. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(screen.getByText('swimcro://claim/abc123')).toBeOnTheScreen();
  });
});
