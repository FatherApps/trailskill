import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryShareCodeCache } from '../data/athleteShareCodeCache';
import { createInMemoryAthleteShareCodeRepository } from '../data/athleteShareCodes';
import { AthleteShareCodeChipContainer } from '../screens/AthleteShareCodeChipContainer';

jest.mock('../../../core/sync', () => ({ supabase: {} }));

// Synthetic ids and codes only.
function setup(options: { failing?: boolean; refusing?: boolean } = {}) {
  const repository = createInMemoryAthleteShareCodeRepository(options);
  const cache = createInMemoryShareCodeCache();
  const share = jest.fn(async () => undefined);
  const chip = (props: { userId?: string; online?: boolean } = {}) => (
    <AthleteShareCodeChipContainer
      athleteId="a1"
      repository={repository}
      cache={cache}
      userId={'userId' in props ? props.userId : 'u1'}
      online={props.online ?? true}
      share={share}
    />
  );
  return { repository, cache, share, chip };
}

describe('AthleteShareCodeChipContainer', () => {
  it('asks the server when nothing is saved, shows the chip and saves the code', async () => {
    const { cache, chip } = setup();
    await render(chip());
    expect(await screen.findByRole('button', { name: 'Compartir el código TS-AAAAA1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Compartir el código/ })).toBeTruthy();
    expect(await cache.get('u1', 'a1')).toBe('TS-AAAAA1');
  });

  it('opens the share sheet with the code message', async () => {
    const { chip, share } = setup();
    await render(chip());
    await fireEvent.press(await screen.findByRole('button', { name: 'Compartir el código TS-AAAAA1' }));
    expect(share).toHaveBeenCalledWith('Código de Swimcro para compartir tiempos: TS-AAAAA1');
  });

  it('paints the saved code without signal', async () => {
    const { cache, repository, chip } = setup({ failing: true });
    await cache.set('u1', 'a1', 'TS-AAAAAA');
    await render(chip({ online: false }));
    expect(await screen.findByRole('button', { name: 'Compartir el código TS-AAAAAA' })).toBeTruthy();
    expect(repository.codes.size).toBe(0);
  });

  it('shows nothing without signal and without a saved code', async () => {
    const { chip } = setup();
    await render(chip({ online: false }));
    await act(async () => {});
    expect(screen.queryByRole('button', { name: /^Compartir el código/ })).toBeNull();
  });

  it('keeps the saved code when the server does not answer', async () => {
    const { cache, chip } = setup({ failing: true });
    await cache.set('u1', 'a1', 'TS-AAAAAA');
    await render(chip());
    expect(await screen.findByRole('button', { name: 'Compartir el código TS-AAAAAA' })).toBeTruthy();
    expect(await cache.get('u1', 'a1')).toBe('TS-AAAAAA');
  });

  it('replaces the saved code with the server one in the background', async () => {
    const { cache, repository, chip } = setup();
    await cache.set('u1', 'a1', 'TS-AAAAAA');
    repository.codes.set('a1', 'TS-BBBBBB');
    await render(chip());
    expect(await screen.findByRole('button', { name: 'Compartir el código TS-BBBBBB' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Compartir el código TS-AAAAAA' })).toBeNull();
    expect(await cache.get('u1', 'a1')).toBe('TS-BBBBBB');
  });

  it('never shows the code another user saved on the same phone', async () => {
    const { cache, chip } = setup({ failing: true });
    await cache.set('u1', 'a1', 'TS-AAAAAA');
    await render(chip({ userId: 'u2', online: false }));
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Compartir el código TS-AAAAAA' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Compartir el código/ })).toBeNull();
  });

  it('forgets the saved code and hides the chip when the server refuses', async () => {
    const { cache, chip } = setup({ refusing: true });
    await cache.set('u1', 'a1', 'TS-AAAAAA');
    await render(chip());
    await act(async () => {});
    expect(screen.queryByRole('button', { name: /^Compartir el código/ })).toBeNull();
    expect(await cache.get('u1', 'a1')).toBeNull();
  });
});
