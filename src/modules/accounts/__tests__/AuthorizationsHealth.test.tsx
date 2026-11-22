import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryAuthorizationRepository, type AuthorizationText } from '../data/authorizations';
import { JOIN_PURPOSES } from '../data/invitations';
import { AuthorizationsContainer } from '../screens/AuthorizationsContainer';
import { AuthorizationsScreen } from '../screens/AuthorizationsScreen';

// Issue 1371: store_health_data and share_health_with_school are two optional authorizations, separate from each other and from joining a school.
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: '', document: '' } }));
jest.mock('../../../core/sync', () => ({
  db: {},
  supabase: {},
  RecordSyncStatus: jest.requireActual('../../../core/sync/RecordSyncStatus').RecordSyncStatus,
  useRecordSyncState: () => 'on_device',
}));
jest.mock('../../../core/sync/db', () => ({ db: {} }));
jest.mock('../../../core/sync/syncState', () => ({ useRecordSyncState: () => 'on_device' }));
jest.mock('../../../core/sync/writes', () => ({ retryFailedRecord: jest.fn() }));
jest.mock('../components/AthleteAvatarWithPhoto', () => {
  const { Text } = jest.requireActual('react-native');
  return { AthleteAvatarWithPhoto: ({ initials }: { initials: string }) => <Text>{`avatar ${initials}`}</Text> };
});

// Synthetic data only.
const texts: AuthorizationText[] = [
  { id: 't-record', purpose: 'record_times', version: 1, body: 'Synthetic record text' },
  { id: 't-import', purpose: 'import_official_results', version: 1, body: 'Synthetic import text' },
  { id: 't-share', purpose: 'share_results_with_school', version: 1, body: 'Synthetic share text' },
  { id: 't-photo', purpose: 'show_photo', version: 1, body: 'Synthetic photo text' },
  { id: 't-share-health', purpose: 'share_health_with_school', version: 1, body: 'Synthetic school health text' },
  { id: 't-store-health', purpose: 'store_health_data', version: 1, body: 'Synthetic stored health text' },
];
const athletes = [{ id: 'a1', name: 'Ana M.' }];
const STORE = 'Guardar los datos de salud del deportista';
const SHARE = 'Dejar que la escuela consulte los datos de salud en una emergencia';
const HEALTH_WARNING = 'los datos de salud del deportista guardados en Swimcro se borran';

async function renderManage() {
  const repository = createInMemoryAuthorizationRepository(texts);
  await render(<AuthorizationsContainer userId="guardian-1" athletes={athletes} mode="manage" onDone={jest.fn()} repository={repository} />);
  return repository;
}

async function grant(...names: string[]) {
  for (const name of names) await fireEvent.press(await screen.findByRole('checkbox', { name }));
  await fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
}

describe('health authorizations', () => {
  it('lists the two purposes after the photo, each with its own checkbox, none checked', async () => {
    const repository = await renderManage();

    expect((await repository.listCurrentTexts('es-CO')).map(({ purpose }) => purpose).slice(-3)).toEqual(['show_photo', 'store_health_data', 'share_health_with_school']);
    expect(await screen.findByRole('checkbox', { name: STORE })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: SHARE })).not.toBeChecked();
  });

  it('granting one writes only that authorization; the other stays unanswered', async () => {
    const repository = await renderManage();

    await grant(STORE);

    const rows = await repository.listAuthorizations('guardian-1', ['a1']);
    expect(rows.map(({ purpose }) => purpose)).toEqual(['store_health_data']);
    expect(await repository.isInForce('a1', 'share_health_with_school')).toBe(false);
  });

  it('granting both writes one row for each, with the text that was shown', async () => {
    const repository = await renderManage();

    await grant(STORE, SHARE);

    const rows = await repository.listAuthorizations('guardian-1', ['a1']);
    expect(rows.map(({ purpose, textId }) => [purpose, textId]).sort()).toEqual([
      ['share_health_with_school', 't-share-health'],
      ['store_health_data', 't-store-health'],
    ]);
  });

  it('withdrawing store_health_data warns that the health data are deleted, and the withdrawal records the evidence', async () => {
    const repository = await renderManage();
    await grant(STORE);

    await fireEvent.press(await screen.findByRole('checkbox', { name: STORE }));
    expect(screen.getByText(new RegExp(HEALTH_WARNING))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await repository.isInForce('a1', 'store_health_data')).toBe(true);

    await fireEvent.press(screen.getByRole('checkbox', { name: STORE }));
    await fireEvent.press(screen.getByRole('button', { name: 'Retirar' }));

    expect(await repository.isInForce('a1', 'store_health_data')).toBe(false);
    expect((await repository.listAuthorizations('guardian-1', ['a1']))[0]?.withdrawnAt).not.toBeNull();
  });

  it('withdrawing share_health_with_school, or any other purpose, shows the ordinary notice without the health-data warning', async () => {
    await renderManage();
    await grant(SHARE);

    await fireEvent.press(await screen.findByRole('checkbox', { name: SHARE }));

    expect(screen.getByText('¿Retirar esta autorización?')).toBeOnTheScreen();
    expect(screen.queryByText(new RegExp(HEALTH_WARNING))).not.toBeOnTheScreen();
    expect(screen.getByText(/Queda retirada desde ahora/)).toBeOnTheScreen();
  });
});

describe('health authorizations when joining a school', () => {
  it('joining still accepts exactly the three results purposes; neither health purpose is among them', () => {
    expect(JOIN_PURPOSES).toEqual(['record_times', 'import_official_results', 'share_results_with_school']);
  });

  it('the screen of joining shows no health text and no health box for the swimmer who joins', async () => {
    await render(
      <AuthorizationsScreen
        mode="registration"
        athletes={athletes}
        texts={texts}
        inForce={{}}
        onSave={jest.fn().mockResolvedValue(true)}
        onWithdraw={jest.fn()}
        join={{ athleteIds: ['a1'], onAccept: jest.fn().mockResolvedValue(true), onDecline: jest.fn().mockResolvedValue(true) }}
      />,
    );

    expect(screen.queryByRole('checkbox', { name: STORE })).not.toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: SHARE })).not.toBeOnTheScreen();
    expect(screen.queryByText('Synthetic stored health text')).not.toBeOnTheScreen();
    expect(screen.queryByText('Synthetic school health text')).not.toBeOnTheScreen();
  });
});
