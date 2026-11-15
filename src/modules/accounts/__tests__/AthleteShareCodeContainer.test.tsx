import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryAthleteShareCodeRepository } from '../data/athleteShareCodes';
import { AthleteShareCodeContainer } from '../screens/AthleteShareCodeContainer';

jest.mock('../../../core/sync', () => ({ supabase: {} }));

async function show(options: { online?: boolean; failing?: boolean } = {}) {
  const repository = createInMemoryAthleteShareCodeRepository({ names: { a1: 'Ana M.' }, failing: options.failing });
  const share = jest.fn(async () => undefined);
  const view = await render(
    <AthleteShareCodeContainer athleteId="a1" athleteName="Ana" repository={repository} online={options.online ?? true} share={share} />,
  );
  return { repository, share, view };
}

describe('AthleteShareCodeContainer', () => {
  it('shows the swimmer code and shares it', async () => {
    const { share } = await show();
    expect(await screen.findByText('TS-AAAAA1')).toBeTruthy();
    expect(screen.getByText(/otra familia que tome tiempos de Ana/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Copiar o compartir código'));
    expect(share).toHaveBeenCalledWith('Código de TrailSkill para compartir tiempos: TS-AAAAA1');
  });

  it('changes the code after confirming, and the old one stops finding the swimmer', async () => {
    const { repository } = await show();
    await screen.findByText('TS-AAAAA1');
    await fireEvent.press(screen.getByText('Cambiar código'));
    expect(screen.getByText('El código actual deja de funcionar de inmediato. Quien lo tenga necesitará el nuevo.')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Cambiar código').at(-1)!);
    expect(await screen.findByText('TS-AAAAA2')).toBeTruthy();
    expect(await repository.find('TS-AAAAA1')).toBeNull();
    expect(await repository.find('TS-AAAAA2')).toBe('Ana M.');
  });

  it('keeps the code when the person cancels the change', async () => {
    await show();
    await screen.findByText('TS-AAAAA1');
    await fireEvent.press(screen.getByText('Cambiar código'));
    await fireEvent.press(screen.getByText('Conservar'));
    expect(screen.getByText('TS-AAAAA1')).toBeTruthy();
  });

  it('asks for signal while offline, and shows the code once connected', async () => {
    const { repository, share, view } = await show({ online: false });
    expect(screen.getByText('Con señal verás aquí el código.')).toBeTruthy();
    expect(repository.codes.size).toBe(0);
    await view.rerender(<AthleteShareCodeContainer athleteId="a1" athleteName="Ana" repository={repository} online share={share} />);
    expect(await screen.findByText('TS-AAAAA1')).toBeTruthy();
  });

  it('offers a retry when the server does not answer', async () => {
    await show({ failing: true });
    expect(await screen.findByText('No pudimos traer el código')).toBeTruthy();
    expect(screen.getByText('Intentar de nuevo')).toBeTruthy();
  });
});
