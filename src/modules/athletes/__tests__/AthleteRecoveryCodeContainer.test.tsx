import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { t } from '../../../core/i18n';
import { AthleteRecoveryCodeContainer, createInMemoryAthleteRecoveryCodeRepository, createInMemoryRecoveryCodeVault } from '..';

jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const show = () => t('athletes.recovery_code.show');

async function setup(options: { saved?: boolean | string; used?: boolean; pending?: boolean } & Partial<ComponentProps<typeof AthleteRecoveryCodeContainer>> = {}) {
  const { saved = true, used = false, pending = false, ...overrides } = options;
  const repository = createInMemoryAthleteRecoveryCodeRepository(['a1']);
  const issued = await repository.issue('a1');
  await repository.confirm('a1', issued!.mainCode);
  if (used) repository.used.add('a1');
  const vault = createInMemoryRecoveryCodeVault();
  if (saved) await vault.set('u1', 'a1', typeof saved === 'string' ? saved : 'TR-TEST-AAAA');
  if (pending) await vault.setConfirmPending('u1', 'a1', true);
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

  it('shows «no está en este teléfono» when what is stored cannot be read, and never offers it as a code', async () => {
    const vault = { ...createInMemoryRecoveryCodeVault(), get: jest.fn().mockRejectedValue(new Error('recovery_code_unreadable')) };
    await setup({ vault });

    await fireEvent.press(await screen.findByText(show()));

    expect(screen.getByText(t('athletes.recovery_code.missing'))).toBeTruthy();
  });

  it('tells the server again, on opening the profile, which set was saved when an earlier confirmation failed, and clears the marker', async () => {
    const confirm = jest.fn().mockResolvedValue(undefined);
    const repository = createInMemoryAthleteRecoveryCodeRepository(['a1']);
    const issued = await repository.issue('a1');
    jest.spyOn(repository, 'confirm').mockImplementation(confirm);
    const { vault } = await setup({ repository, saved: issued!.mainCode, pending: true });

    await waitFor(() => expect(vault.pending.size).toBe(0));
    expect(confirm).toHaveBeenCalledWith('a1', issued!.mainCode);
  });

  it('keeps the marker and says nothing while the server cannot be reached on opening the profile', async () => {
    const repository = createInMemoryAthleteRecoveryCodeRepository(['a1']);
    const issued = await repository.issue('a1');
    jest.spyOn(repository, 'confirm').mockRejectedValue(new Error('Failed to fetch'));
    const { vault } = await setup({ repository, saved: issued!.mainCode, pending: true });

    await fireEvent.press(await screen.findByText(show()));
    expect(await screen.findByText(issued!.mainCode)).toBeTruthy();
    expect(vault.pending.size).toBe(1);
  });

  it('says so when, on opening the profile, the server answers that the saved set was replaced: the code is forgotten', async () => {
    const { vault } = await setup({ saved: 'TR-TEST-OLD', pending: true });

    expect(await screen.findByText(t('athletes.recovery_code.replaced'))).toBeTruthy();
    expect(vault.entries.size).toBe(0);
    expect(vault.pending.size).toBe(0);
    await fireEvent.press(screen.getByText(show()));
    expect(screen.queryByText('TR-TEST-OLD')).toBeNull();
  });

  it('does not ask the server on opening the profile when there is no marker, or offline', async () => {
    const repository = createInMemoryAthleteRecoveryCodeRepository(['a1']);
    const issued = await repository.issue('a1');
    const confirm = jest.spyOn(repository, 'confirm');
    await setup({ repository, saved: issued!.mainCode });
    await setup({ repository, saved: issued!.mainCode, pending: true, online: false });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(confirm).not.toHaveBeenCalled();
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
