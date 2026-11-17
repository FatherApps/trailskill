import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

// The sync state of each record, as the outbox would tell it; a record not named here is synced.
let mockStates: Record<string, string> = {};
jest.mock('../../../core/sync', () => ({
  db: {},
  useRecordSyncStates: (_table: string, ids: string[]) => new Map(ids.map((id) => [id, mockStates[id] ?? 'synced'])),
}));
beforeEach(() => {
  mockStates = {};
});

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [] }];

const time = (id: string, distance: FamilyMeasurement['distance'], createdBy = 'u1'): FamilyMeasurement => ({
  id,
  athleteId: 'a1',
  createdBy,
  stroke: 'FR',
  distance,
  pool: 'SCM',
  sessionType: 'training',
  competition: null,
  capturedAt: '2026-11-08T14:00:00.000Z',
  millis: 47_210,
  splits: [],
  officialMillis: null,
  officialSetAt: null,
});
const rejected = time('rej-1', '100m');
const accepted = time('ok-1', '50m');
const pendingTime = time('new-1', '25m');
const otherUsers = time('rej-2', '200m', 'u2');

async function setup(synced: FamilyMeasurement[], phoneOnlyRejected: FamilyMeasurement[], failing = false) {
  const fake = createInMemoryFamilyMeasurementRepository(synced, phoneOnlyRejected);
  const repository = failing ? { ...fake, discardRejected: jest.fn().mockRejectedValue(new Error('offline')) } : fake;
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'thousandths' })}>
      <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} onBack={jest.fn()} />
    </PreferencesProvider>,
  );
  return repository;
}

// Issue #1025: a time only on the phone that the server rejected says so, and can be deleted for good after asking.

// Editing opens from the time's detail ("Editar registro").
async function openDetail(index = 0) {
  await fireEvent.press((await screen.findAllByHintText('Abre el detalle del tiempo'))[index]);
}

describe('a time the server did not accept', () => {
  it('says "No enviado" on its card in the list and in its detail', async () => {
    await setup([], [rejected]);
    expect(await screen.findByText('100 m libre')).toBeTruthy();
    expect(screen.getAllByLabelText('No enviado')).toHaveLength(1);

    await fireEvent.press(screen.getByText('100 m libre'));
    expect(await screen.findByText('Detalle del tiempo')).toBeTruthy();
    expect(screen.getAllByLabelText('No enviado')).toHaveLength(1);
  });

  it('is not marked on an accepted time nor on a pending one, which offer no direct delete', async () => {
    mockStates = { 'ok-1': 'synced', 'new-1': 'on_device' };
    await setup([accepted, pendingTime], []);
    expect(await screen.findByText('50 m libre')).toBeTruthy();
    expect(screen.getByText('25 m libre')).toBeTruthy();
    expect(screen.queryByLabelText('No enviado')).toBeNull();
    expect(screen.queryByText('Eliminar tiempo')).toBeNull();
  });

  it('marks a synced time the outbox says was rejected, but keeps editing and gives it no direct delete', async () => {
    mockStates = { 'ok-1': 'not_sent' };
    await setup([accepted], []);
    expect(await screen.findByLabelText('No enviado')).toBeTruthy();
    expect(screen.queryByText('Eliminar tiempo')).toBeNull();
    await openDetail();
    expect(await screen.findByText('Editar registro')).toBeTruthy();
    expect(screen.queryByText('Eliminar tiempo')).toBeNull();
  });

  it('is never the best time nor offers to edit', async () => {
    await setup([], [rejected]);
    await screen.findByLabelText('No enviado');
    expect(screen.queryByLabelText('Mejor tiempo')).toBeNull();
    await openDetail();
    expect(await screen.findByText('Detalle del tiempo')).toBeTruthy();
    expect(screen.queryByText('Editar registro')).toBeNull();
  });

  it('keeps the time when the confirmation is cancelled', async () => {
    const repository = await setup([], [rejected]);
    await fireEvent.press(await screen.findByText('Eliminar tiempo'));
    expect(await screen.findByText('¿Eliminar este tiempo?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Conservar'));
    expect(await repository.listRejected('u1', 'a1')).toHaveLength(1);
    expect(screen.getByText('100 m libre')).toBeTruthy();
  });

  it('deletes only after confirming, from the list, and leaves another user\'s rejected time alone', async () => {
    const repository = await setup([], [rejected, otherUsers]);
    expect(screen.queryByText('200 m libre')).toBeNull();
    await fireEvent.press(await screen.findByText('Eliminar tiempo'));
    await fireEvent.press(screen.getAllByText('Eliminar tiempo').at(-1)!);
    await waitFor(async () => expect(await repository.listRejected('u1', 'a1')).toEqual([]));
    await waitFor(() => expect(screen.queryByText('100 m libre')).toBeNull());
    expect(await repository.listRejected('u2', 'a1')).toHaveLength(1);
  });

  it('deletes from the detail too and returns to the list', async () => {
    const repository = await setup([], [rejected]);
    await fireEvent.press(await screen.findByText('100 m libre'));
    await fireEvent.press(await screen.findByText('Eliminar tiempo'));
    await fireEvent.press(screen.getAllByText('Eliminar tiempo').at(-1)!);
    await waitFor(async () => expect(await repository.listRejected('u1', 'a1')).toEqual([]));
    expect(await screen.findByText('Medir un tiempo')).toBeTruthy();
  });

  it('keeps the time and says so when the confirmation is dismissed without choosing, as with Android back or a tap outside', async () => {
    const repository = await setup([], [rejected]);
    await fireEvent.press(await screen.findByText('Eliminar tiempo'));
    await fireEvent.press(await screen.findByTestId('confirm-sheet-scrim'));
    await waitFor(() => expect(screen.queryByText('¿Eliminar este tiempo?')).toBeNull());
    expect(await repository.listRejected('u1', 'a1')).toHaveLength(1);
    expect(screen.getByText('100 m libre')).toBeTruthy();
  });

  describe('when the deletion fails', () => {
    const error = 'No pudimos eliminar el tiempo. Inténtalo de nuevo.';

    it('says so in the list, keeps the time, and forgets the warning when asking again', async () => {
      const repository = await setup([], [rejected], true);
      await fireEvent.press(await screen.findByText('Eliminar tiempo'));
      await fireEvent.press(screen.getAllByText('Eliminar tiempo').at(-1)!);
      expect(await screen.findByText(error)).toBeTruthy();
      expect(await repository.listRejected('u1', 'a1')).toHaveLength(1);
      expect(screen.getByText('100 m libre')).toBeTruthy();

      await fireEvent.press(screen.getByText('Eliminar tiempo'));
      expect(screen.queryByText(error)).toBeNull();
    });

    it('says so in the detail too, and the warning is gone after going back to the list', async () => {
      await setup([], [rejected], true);
      await fireEvent.press(await screen.findByText('100 m libre'));
      await fireEvent.press(await screen.findByText('Eliminar tiempo'));
      await fireEvent.press(screen.getAllByText('Eliminar tiempo').at(-1)!);
      expect(await screen.findByText(error)).toBeTruthy();
      expect(screen.getByText('Detalle del tiempo')).toBeTruthy();

      await fireEvent.press(screen.getByText('Volver a la lista'));
      expect(await screen.findByText('Medir un tiempo')).toBeTruthy();
      expect(screen.queryByText(error)).toBeNull();
    });
  });
});
