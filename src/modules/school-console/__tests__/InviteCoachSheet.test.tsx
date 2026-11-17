import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';

import { Banner } from '../../../core/ui';
import { schoolNameFixture } from '../__fixtures__/athletes';
import { InviteCoachSheet } from '../components/InviteCoachSheet';
import { inviteShareText } from '../components/inviteShare';

const text = 'Escuela Delfines te invitó como entrenador en Swimcro. Descarga la app e inicia sesión con este correo: rosa@example.com.';

const open = async (extra: Partial<React.ComponentProps<typeof InviteCoachSheet>> = {}) => {
  const props = { groups: [], schoolName: schoolNameFixture, onSubmit: jest.fn().mockResolvedValue(undefined), onClose: jest.fn(), ...extra };
  await render(<InviteCoachSheet {...props} />);
  return props;
};

// Fills the form and sends it: the sheet then shows the created invitation.
const create = async () => {
  await fireEvent.changeText(screen.getByLabelText('Nombre'), 'Rosa Londoño');
  await fireEvent.changeText(screen.getByLabelText('Correo'), ' rosa@example.com ');
  await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));
};

afterEach(() => jest.restoreAllMocks());

describe('inviteShareText', () => {
  it('names the school and the email, and leaves the link out while there is none', () => {
    expect(inviteShareText(schoolNameFixture, 'rosa@example.com')).toBe(text);
  });

  it('adds the link when there is one', () => {
    expect(inviteShareText(schoolNameFixture, 'rosa@example.com', 'https://example.test/app')).toBe(`${text} Descárgala aquí: https://example.test/app`);
  });
});

describe('InviteCoachSheet once the invitation is created', () => {
  it('stays open and offers Compartir invitación and Listo instead of the form', async () => {
    const { onSubmit, onClose } = await open();

    await create();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Invitación creada para rosa@example.com.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Compartir invitación' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Nombre')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar invitación' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the form while the invitation is not created', async () => {
    await open({ onSubmit: jest.fn().mockRejectedValue(new Error('offline')) });

    await create();

    expect(screen.getByText('No pudimos enviar la invitación. Inténtalo de nuevo.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Compartir invitación' })).toBeNull();
  });

  it('shares the instructions with the school and the trimmed email, and no link', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    await open();
    await create();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir invitación' }));

    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ message: text });
    expect(share.mock.calls[0]![0].message).not.toMatch(/swimcro:\/\/|trailskill:\/\/|https?:/);
    expect(screen.queryByText('No pudimos compartir la invitación. Inténtalo de nuevo.')).toBeNull();
  });

  it('says so when the system could not share, and lets the person try again', async () => {
    const share = jest.spyOn(Share, 'share').mockRejectedValueOnce(new Error('no share target')).mockResolvedValueOnce({ action: Share.sharedAction, activityType: undefined });
    await open();
    await create();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir invitación' }));
    expect(screen.getByText('No pudimos compartir la invitación. Inténtalo de nuevo.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir invitación' }));
    expect(share).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('No pudimos compartir la invitación. Inténtalo de nuevo.')).toBeNull();
  });

  it('does not take the person closing the share sheet as an error', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction, activityType: undefined });
    await open();
    await create();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir invitación' }));

    expect(screen.queryByText('No pudimos compartir la invitación. Inténtalo de nuevo.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Compartir invitación' })).toBeOnTheScreen();
  });

  it('does not open the share sheet twice from a second press while it is open', async () => {
    let finish!: () => void;
    const share = jest.spyOn(Share, 'share').mockImplementation(() => new Promise((resolve) => (finish = () => resolve({ action: Share.sharedAction, activityType: undefined }))));
    await open();
    await create();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir invitación' }));
    await fireEvent.press(screen.getByRole('button', { name: /^Compartir invitación/ }));
    expect(share).toHaveBeenCalledTimes(1);

    await act(async () => finish());
  });

  it('shows the notice of the caller above the result, where a late failure of the email can hang', async () => {
    await open({ notice: <Banner variant="warn" icon="error">El correo no salió</Banner> });

    expect(screen.getByText('El correo no salió')).toBeOnTheScreen();
    await create();

    expect(screen.getByText('El correo no salió')).toBeOnTheScreen();
    expect(screen.getByText('Invitación creada para rosa@example.com.')).toBeOnTheScreen();
  });
});
