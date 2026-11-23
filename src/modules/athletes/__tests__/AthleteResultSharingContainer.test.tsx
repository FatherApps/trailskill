import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { t } from '../../../core/i18n';
import {
  AthleteResultSharingContainer,
  createInMemoryAthleteResultSharingRepository,
  createInMemoryAthleteSchoolRepository,
  type AthleteResultSharingEntry,
  type AthleteSchoolRow,
} from '..';

jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only. Two schools, both active, unless a test says otherwise.
const names = [
  { id: 's1', name: 'Escuela Uno' },
  { id: 's2', name: 'Escuela Dos' },
];
const link = (schoolId: string, endedAt: string | null = null): AthleteSchoolRow => ({ athleteId: 'a1', schoolId, categoryId: null, endedAt });
const label = (school: string) => t('athletes.result_sharing.label', { school });

type Options = { links?: AthleteSchoolRow[]; shared?: AthleteResultSharingEntry[]; granted?: string[]; managedIds?: string[] } & Partial<ComponentProps<typeof AthleteResultSharingContainer>>;

async function setup({ links = [link('s1'), link('s2')], shared = [], granted = ['a1'], managedIds, ...overrides }: Options = {}) {
  const sharing = createInMemoryAthleteResultSharingRepository(shared, managedIds ? { managedIds } : {});
  const grant = jest.spyOn(sharing, 'grant');
  const revoke = jest.spyOn(sharing, 'revoke');
  const view = await render(
    <AthleteResultSharingContainer
      athleteId="a1"
      schoolLinks={createInMemoryAthleteSchoolRepository(links)}
      schoolNames={{ listByIds: async (ids) => names.filter((n) => ids.includes(n.id)) }}
      authorizations={{ listGrantedAthleteIds: async () => granted, listStatuses: async () => [] }}
      sharing={sharing}
      {...overrides}
    />,
  );
  return { sharing, grant, revoke, view };
}

describe('AthleteResultSharingContainer', () => {
  it('shows one row per school with the text of the switch when the swimmer is active in two schools and the authorization is in force', async () => {
    await setup();

    expect(await screen.findByText(label('Escuela Uno'))).toBeTruthy();
    expect(screen.getByText(label('Escuela Dos'))).toBeTruthy();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });

  it.each([
    ['one active school', { links: [link('s1')] }],
    ['the other link ended', { links: [link('s1'), link('s2', '2026-11-01')] }],
    ['the authorization not in force', { granted: [] }],
    ['the authorization of another swimmer only', { granted: ['a2'] }],
  ])('shows nothing with %s', async (_name, options: Options) => {
    const { view } = await setup(options);

    await waitFor(() => expect(view.toJSON()).toBeNull());
  });

  it('shows nothing when the device cannot read it', async () => {
    const { view } = await setup({ authorizations: { listGrantedAthleteIds: async () => Promise.reject(new Error('db')), listStatuses: async () => [] } });

    await waitFor(() => expect(view.toJSON()).toBeNull());
  });

  it('shows the switch on for the schools in the local table and off for the others', async () => {
    await setup({ shared: [{ athleteId: 'a1', schoolId: 's2', revokedAt: null }, { athleteId: 'a1', schoolId: 's1', revokedAt: '2026-11-20' }] });

    await screen.findByText(label('Escuela Uno'));
    expect(screen.getByLabelText(label('Escuela Uno'))).not.toBeChecked();
    expect(screen.getByLabelText(label('Escuela Dos'))).toBeChecked();
  });

  it('turning one on calls grant with the swimmer and that school, and keeps it on', async () => {
    const { grant, revoke } = await setup();

    await fireEvent.press(await screen.findByLabelText(label('Escuela Dos')));

    await waitFor(() => expect(screen.getByLabelText(label('Escuela Dos'))).toBeChecked());
    expect(grant).toHaveBeenCalledTimes(1);
    expect(grant).toHaveBeenCalledWith('a1', 's2');
    expect(revoke).not.toHaveBeenCalled();
    expect(screen.getByLabelText(label('Escuela Uno'))).not.toBeChecked();
  });

  it('turning one off calls revoke with the swimmer and that school', async () => {
    const { grant, revoke } = await setup({ shared: [{ athleteId: 'a1', schoolId: 's2', revokedAt: null }] });

    await fireEvent.press(await screen.findByLabelText(label('Escuela Dos')));

    await waitFor(() => expect(screen.getByLabelText(label('Escuela Dos'))).not.toBeChecked());
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('a1', 's2');
    expect(grant).not.toHaveBeenCalled();
  });

  it('puts the switch back and shows the existing generic error when the call fails', async () => {
    const { grant } = await setup();
    grant.mockRejectedValueOnce(new Error('Failed to fetch'));

    await fireEvent.press(await screen.findByLabelText(label('Escuela Dos')));

    expect(await screen.findByText(t('athletes.screen.error.message'))).toBeTruthy();
    expect(screen.getByLabelText(label('Escuela Dos'))).not.toBeChecked();
  });

  it('puts a withdrawn switch back on when revoke fails, and clears the error on the next success', async () => {
    const { revoke } = await setup({ shared: [{ athleteId: 'a1', schoolId: 's2', revokedAt: null }] });
    revoke.mockRejectedValueOnce(new Error('Failed to fetch'));

    await fireEvent.press(await screen.findByLabelText(label('Escuela Dos')));
    await screen.findByText(t('athletes.screen.error.message'));
    expect(screen.getByLabelText(label('Escuela Dos'))).toBeChecked();

    await fireEvent.press(screen.getByLabelText(label('Escuela Dos')));
    await waitFor(() => expect(screen.queryByText(t('athletes.screen.error.message'))).toBeNull());
    expect(screen.getByLabelText(label('Escuela Dos'))).not.toBeChecked();
  });

  it('ignores a second tap on a school while its call is on the way', async () => {
    let finish: () => void = () => {};
    const { grant } = await setup();
    grant.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));

    const row = await screen.findByLabelText(label('Escuela Dos'));
    await fireEvent.press(row);
    await fireEvent.press(row);
    finish();

    await waitFor(() => expect(grant).toHaveBeenCalledTimes(1));
  });
});
