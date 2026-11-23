import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { t } from '../../../core/i18n';
import { AthleteRecoveryCodeContainer, createInMemoryAthleteRecoveryCodeRepository, createInMemoryRecoveryCodeVault } from '..';

jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const show = () => t('athletes.recovery_code.show');

async function setup(options: { saved?: boolean; used?: boolean } & Partial<ComponentProps<typeof AthleteRecoveryCodeContainer>> = {}) {
  const { saved = true, used = false, ...overrides } = options;
  const repository = createInMemoryAthleteRecoveryCodeRepository(['a1']);
  await repository.issue('a1');
  await repository.confirm('a1');
  if (used) repository.used.add('a1');
  const vault = createInMemoryRecoveryCodeVault();
  if (saved) await vault.set('u1', 'a1', 'TR-TEST-AAAA');
  const share = jest.fn().mockResolvedValue(undefined);
  const view = await render(
    <AthleteRecoveryCodeContainer athleteId="a1" athleteName="Ana" userId="u1" repository={repository} vault={vault} online share={share} {...overrides} />,
  );
  return { repository, vault, share, view };
}

describe('AthleteRecoveryCodeContainer', () => {
  it('keeps the code hidden until the owner taps the row, and hides it again on a second tap', async () => {
    await setup();
    await screen.findByText(show());
    expect(screen.queryByText('TR-TEST-AAAA')).toBeNull();

    await fireEvent.press(screen.getByText(show()));
    expect(await screen.findByText('TR-TEST-AAAA')).toBeTruthy();

    await fireEvent.press(screen.getByText(t('athletes.recovery_code.hide')));
    expect(screen.queryByText('TR-TEST-AAAA')).toBeNull();
  });

  it('reads the code of the signed-in user only: another account on the phone sees that nothing is saved', async () => {
    await setup({ userId: 'u2' });

    await fireEvent.press(await screen.findByText(show()));

    expect(screen.queryByText('TR-TEST-AAAA')).toBeNull();
    expect(screen.getByText(t('athletes.recovery_code.missing'))).toBeTruthy();
  });

  it('tells the owner when this phone has no code saved', async () => {
    await setup({ saved: false });

    await fireEvent.press(await screen.findByText(show()));

    expect(screen.getByText(t('athletes.recovery_code.missing'))).toBeTruthy();
  });

  it('copies the code with the share sheet once revealed', async () => {
    const { share } = await setup();
    await fireEvent.press(await screen.findByText(show()));

    await fireEvent.press(screen.getByText(t('athletes.recovery_code.copy')));

    expect(share).toHaveBeenCalledWith(expect.stringContaining('TR-TEST-AAAA'));
  });

  it('generates a new set after a recovery code was used and shows it once, without touching the saved code', async () => {
    const { repository, vault } = await setup({ used: true });

    await fireEvent.press(await screen.findByText(t('athletes.recovery_code.regenerate')));
    await fireEvent.press(await screen.findByText(t('athletes.recovery_code.regenerate_confirm')));

    expect(await screen.findByText('RC-TEST-2-0001')).toBeTruthy();
    expect(screen.getByText('RC-TEST-2-0008')).toBeTruthy();
    expect(repository.calls.regenerate).toBe(1);
    expect([...vault.entries.values()]).toEqual(['TR-TEST-AAAA']);

    await fireEvent.press(screen.getByText(t('athletes.recovery_codes.done')));
    await waitFor(() => expect(screen.queryByText('RC-TEST-2-0001')).toBeNull());
    expect([...vault.entries.values()]).toEqual(['TR-TEST-AAAA']);
  });

  it('explains that no recovery code was used yet instead of generating a set', async () => {
    await setup();

    await fireEvent.press(await screen.findByText(t('athletes.recovery_code.regenerate')));
    await fireEvent.press(await screen.findByText(t('athletes.recovery_code.regenerate_confirm')));

    expect(await screen.findByText(t('athletes.recovery_code.regenerate_unused'))).toBeTruthy();
    expect(screen.queryByText('RC-TEST-2-0001')).toBeNull();
  });

  it('does not offer a new set offline', async () => {
    const { repository } = await setup({ used: true, online: false });

    // A button that is off shows its reason after the label.
    const off = await screen.findByText(`${t('athletes.recovery_code.regenerate')} · ${t('athletes.recovery_code.regenerate_offline')}`);
    await fireEvent.press(off);

    expect(screen.queryByText(t('athletes.recovery_code.regenerate_confirm'))).toBeNull();
    expect(repository.calls.regenerate).toBe(0);
  });
});
