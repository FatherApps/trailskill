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
    await repository.issue('a1');
    await repository.confirm('a1');
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
