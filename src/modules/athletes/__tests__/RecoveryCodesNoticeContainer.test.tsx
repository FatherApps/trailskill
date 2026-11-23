import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { t } from '../../../core/i18n';
import { createInMemoryManagedAthleteRepository } from '../../accounts';
import {
  createInMemoryAthleteRecoveryCodeRepository,
  createInMemoryRecoveryCodeVault,
  createInMemorySchoolAthleteRepository,
  ManagedRecoveryCodesNotice,
  RecoveryCodesNoticeContainer,
} from '..';

jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const athletes = [{ id: 'a1', firstName: 'Ana' }];
const done = () => t('athletes.recovery_codes.done');

async function setup(overrides: Partial<ComponentProps<typeof RecoveryCodesNoticeContainer>> = {}) {
  const repository = createInMemoryAthleteRecoveryCodeRepository(['a1']);
  const vault = createInMemoryRecoveryCodeVault();
  const share = jest.fn().mockResolvedValue(undefined);
  const props = { repository, vault, userId: 'u1', athletes, online: true, share, ...overrides };
  const view = await render(<RecoveryCodesNoticeContainer {...props} />);
  return { repository: props.repository as typeof repository, vault, share, props, view };
}

describe('RecoveryCodesNoticeContainer', () => {
  it('asks the server once for an owner without a local code and shows the main code and the 8 recovery codes', async () => {
    const { repository } = await setup();

    expect(await screen.findByText('TR-TEST-a1')).toBeTruthy();
    for (let index = 1; index <= 8; index += 1) expect(screen.getByText(`RC-TEST-1-000${index}`)).toBeTruthy();
    expect(repository.calls.issue).toBe(1);
  });

  it('saves only the permanent code, in the vault, and confirms with the server when the owner says they saved them', async () => {
    const { repository, vault } = await setup();

    await fireEvent.press(await screen.findByText(done()));

    await waitFor(() => expect(repository.confirmed.has('a1')).toBe(true));
    expect([...vault.entries.values()]).toEqual(['TR-TEST-a1']);
    await waitFor(() => expect(screen.queryByText('RC-TEST-1-0001')).toBeNull());
  });

  it('does not ask again on a second opening once the code is saved', async () => {
    const { repository, props, view } = await setup();
    await fireEvent.press(await screen.findByText(done()));
    await waitFor(() => expect(screen.queryByText('TR-TEST-a1')).toBeNull());
    await view.unmount();

    await render(<RecoveryCodesNoticeContainer {...props} />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(repository.calls.issue).toBe(1);
    expect(screen.queryByText('TR-TEST-a1')).toBeNull();
  });

  it('shows the codes again, as a new set, if the owner left before saving them: nothing was stored', async () => {
    const { vault, props, view } = await setup();
    await screen.findByText('RC-TEST-1-0001');
    expect(vault.entries.size).toBe(0);
    await view.unmount();

    await render(<RecoveryCodesNoticeContainer {...props} />);

    expect(await screen.findByText('RC-TEST-2-0001')).toBeTruthy();
  });

  it('shows nothing when the server has no codes to give (confirmed before) and does not store anything', async () => {
    const repository = createInMemoryAthleteRecoveryCodeRepository(['a1']);
    const issued = await repository.issue('a1');
    await repository.confirm('a1', issued!.mainCode);
    const { vault } = await setup({ repository });

    await waitFor(() => expect(repository.calls.issue).toBe(2));
    expect(screen.queryByText(done())).toBeNull();
    expect(vault.entries.size).toBe(0);
  });

  it('does not ask offline', async () => {
    const { repository } = await setup({ online: false });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(repository.calls.issue).toBe(0);
  });

  it('keeps the notice with an error when confirming fails and lets the owner try again', async () => {
    const { repository } = await setup();
    const confirm = jest.spyOn(repository, 'confirm').mockRejectedValueOnce(new Error('Failed to fetch'));

    await fireEvent.press(await screen.findByText(done()));
    expect(await screen.findByText(t('athletes.recovery_codes.error'))).toBeTruthy();
    expect(screen.getByText('RC-TEST-1-0001')).toBeTruthy();

    await fireEvent.press(screen.getByText(done()));
    await waitFor(() => expect(screen.queryByText('RC-TEST-1-0001')).toBeNull());
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('keeps a marker when confirming fails and tells the server on the next start, without showing the codes again', async () => {
    const { repository, vault, props, view } = await setup();
    jest.spyOn(repository, 'confirm').mockRejectedValueOnce(new Error('Failed to fetch'));

    await fireEvent.press(await screen.findByText(done()));
    expect(await screen.findByText(t('athletes.recovery_codes.error'))).toBeTruthy();
    // The code is saved here, the server does not know yet: the marker says so.
    expect([...vault.entries.values()]).toEqual(['TR-TEST-a1']);
    expect(vault.pending.size).toBe(1);
    await view.unmount();

    const second = await render(<RecoveryCodesNoticeContainer {...props} />);
    await waitFor(() => expect(repository.confirmed.has('a1')).toBe(true));
    await waitFor(() => expect(vault.pending.size).toBe(0));
    expect(repository.calls.issue).toBe(1);
    expect(screen.queryByText('RC-TEST-1-0001')).toBeNull();
    await second.unmount();
  });

  it('keeps retrying on later starts while the server cannot be reached', async () => {
    const { repository, vault, props, view } = await setup();
    const confirm = jest.spyOn(repository, 'confirm').mockRejectedValue(new Error('Failed to fetch'));
    await fireEvent.press(await screen.findByText(done()));
    await screen.findByText(t('athletes.recovery_codes.error'));
    await view.unmount();

    const second = await render(<RecoveryCodesNoticeContainer {...props} />);
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(vault.pending.size).toBe(1);
    await second.unmount();

    confirm.mockRestore();
    const third = await render(<RecoveryCodesNoticeContainer {...props} />);
    await waitFor(() => expect(vault.pending.size).toBe(0));
    expect(repository.confirmed.has('a1')).toBe(true);
    await third.unmount();
  });

  it('tells the owner when, at the next start, the server says the saved set was replaced: the old code is forgotten and the current set shows', async () => {
    const { repository, vault, props, view } = await setup();
    jest.spyOn(repository, 'confirm').mockRejectedValueOnce(new Error('Failed to fetch'));
    await fireEvent.press(await screen.findByText(done()));
    await screen.findByText(t('athletes.recovery_codes.error'));
    await view.unmount();
    // Another phone asked for the codes before this one could confirm: its set replaced the saved one.
    await repository.issue('a1');

    const second = await render(<RecoveryCodesNoticeContainer {...props} />);

    expect(await screen.findByText(t('athletes.recovery_codes.replaced'))).toBeTruthy();
    expect(screen.getByText('TR-TEST-a1-3')).toBeTruthy();
    expect(vault.entries.size).toBe(0);
    await fireEvent.press(screen.getByText(done()));
    await waitFor(() => expect(repository.confirmed.has('a1')).toBe(true));
    expect([...vault.entries.values()]).toEqual(['TR-TEST-a1-3']);
    expect(vault.pending.size).toBe(0);
    await second.unmount();
  });

  it('shows the current set as a replacement when the server says, on «Ya los guardé», that another phone replaced the one on screen', async () => {
    const { repository, vault } = await setup();
    await screen.findByText('TR-TEST-a1');
    await repository.issue('a1');

    await fireEvent.press(screen.getByText(done()));

    expect(await screen.findByText(t('athletes.recovery_codes.replaced'))).toBeTruthy();
    expect(screen.getByText('TR-TEST-a1-3')).toBeTruthy();
    expect(screen.queryByText('TR-TEST-a1')).toBeNull();
    expect(vault.entries.size).toBe(0);
    expect(repository.confirmed.has('a1')).toBe(false);
  });

  it('does not close in silence when another device already confirmed a newer set: it says the written codes no longer work', async () => {
    const { repository, vault } = await setup();
    await screen.findByText('TR-TEST-a1');
    // Another device (or another guardian) asked for codes and confirmed them: the server has no codes left to give.
    const other = await repository.issue('a1');
    await repository.confirm('a1', other!.mainCode);

    await fireEvent.press(screen.getByText(done()));

    expect(await screen.findByText(t('athletes.recovery_codes.replaced_elsewhere_title'))).toBeTruthy();
    expect(screen.getByText(t('athletes.recovery_codes.replaced_elsewhere_message'))).toBeTruthy();
    expect(screen.queryByText('RC-TEST-1-0001')).toBeNull();
    expect(vault.entries.size).toBe(0);
    expect(vault.pending.size).toBe(0);

    await fireEvent.press(screen.getByText(t('athletes.recovery_codes.replaced_elsewhere_done')));
    await waitFor(() => expect(screen.queryByText(t('athletes.recovery_codes.replaced_elsewhere_title'))).toBeNull());
  });

  it('says it too at the next start when the pending confirmation finds a newer set confirmed elsewhere', async () => {
    const { repository, vault, props, view } = await setup();
    jest.spyOn(repository, 'confirm').mockRejectedValueOnce(new Error('Failed to fetch'));
    await fireEvent.press(await screen.findByText(done()));
    await screen.findByText(t('athletes.recovery_codes.error'));
    await view.unmount();
    const other = await repository.issue('a1');
    await repository.confirm('a1', other!.mainCode);

    const second = await render(<RecoveryCodesNoticeContainer {...props} />);

    expect(await screen.findByText(t('athletes.recovery_codes.replaced_elsewhere_title'))).toBeTruthy();
    expect(vault.entries.size).toBe(0);
    await second.unmount();
  });

  it('writes the pending marker before the code, and drops the marker when the code cannot be saved', async () => {
    const { vault } = await setup();
    const marker = jest.spyOn(vault, 'setConfirmPending');
    const save = jest.spyOn(vault, 'set');
    await fireEvent.press(await screen.findByText(done()));
    await waitFor(() => expect(vault.pending.size).toBe(0));
    expect(marker.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0]!);
    expect(vault.entries.size).toBe(1);
  });

  it('shows the error and leaves no marker when saving the code fails', async () => {
    const { vault } = await setup();
    jest.spyOn(vault, 'set').mockRejectedValueOnce(new Error('recovery_code_conflict'));

    await fireEvent.press(await screen.findByText(done()));

    expect(await screen.findByText(t('athletes.recovery_codes.error'))).toBeTruthy();
    expect(vault.pending.size).toBe(0);
    expect(vault.entries.size).toBe(0);
  });

  it('does not ask the server for codes when what the phone holds cannot be read: it must not be written over', async () => {
    const repository = createInMemoryAthleteRecoveryCodeRepository(['a1']);
    const vault = { ...createInMemoryRecoveryCodeVault(), get: jest.fn().mockRejectedValue(new Error('recovery_code_unreadable')) };
    await setup({ repository, vault });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(repository.calls.issue).toBe(0);
  });

  it('copies the main code and the recovery codes with the share sheet', async () => {
    const { share } = await setup();

    await fireEvent.press(await screen.findByText(t('athletes.recovery_codes.copy')));

    expect(share).toHaveBeenCalledTimes(1);
    const text = share.mock.calls[0]![0] as string;
    expect(text).toContain('TR-TEST-a1');
    expect(text).toContain('RC-TEST-1-0001');
    expect(text).toContain('RC-TEST-1-0008');
  });
});

describe('ManagedRecoveryCodesNotice', () => {
  const rows = { athletes: [{ id: 'a1', firstName: 'Ana', lastName: 'Marin' }], athleteSchools: [], athleteGroups: [] };

  it('asks for the codes of the swimmers the user manages, and for nobody else', async () => {
    const repository = createInMemoryAthleteRecoveryCodeRepository(['a1']);
    const vault = createInMemoryRecoveryCodeVault();
    const managed = createInMemoryManagedAthleteRepository([{ userId: 'u1', athleteId: 'a1' }]);
    const athletes = createInMemorySchoolAthleteRepository(rows);

    const view = await render(<ManagedRecoveryCodesNotice repository={repository} vault={vault} userId="u1" online managed={managed} athletes={athletes} />);
    expect(await screen.findByText('TR-TEST-a1')).toBeTruthy();
    await view.unmount();

    const staff = createInMemoryAthleteRecoveryCodeRepository(['a1']);
    await render(<ManagedRecoveryCodesNotice repository={staff} vault={vault} userId="staff" online managed={managed} athletes={athletes} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(staff.calls.issue).toBe(0);
  });
});
