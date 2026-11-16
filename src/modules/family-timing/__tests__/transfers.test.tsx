import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { createInMemoryFamilyTransferRepository, type FamilyTransfer } from '../data/familyTransfers';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, supabase: {}, useRecordSyncStates: () => new Map() }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [] }];

const time: FamilyMeasurement = {
  id: 'm1',
  athleteId: null,
  createdBy: 'u1',
  stroke: 'FR',
  distance: '50m',
  pool: 'SCM',
  sessionType: 'training',
  competition: null,
  capturedAt: '2026-11-14T10:00:00.000Z',
  millis: 36_000,
  splits: [],
  officialMillis: null,
  officialSetAt: null,
};

async function open(props: Partial<Parameters<typeof FamilyTimingContainer>[0]>, initial: FamilyMeasurement[] = []) {
  const repository = createInMemoryFamilyMeasurementRepository(initial);
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'hundredths' })}>
      <FamilyTimingContainer userId="u1" athletes={athletes} repository={repository} onBack={jest.fn()} {...props} />
    </PreferencesProvider>,
  );
  return repository;
}

const shareCodes = { find: async (code: string) => (code.toUpperCase() === 'TS-BBBBBB' ? 'Ana M.' : null) };

describe('sending a time to another family', () => {
  it('finds the swimmer by the code, sends the time, shows it waiting, and withdraws it', async () => {
    const transfers = createInMemoryFamilyTransferRepository({
      codes: { 'TS-BBBBBB': { athleteId: 'b2', shortName: 'Ana M.' } },
      measurements: (id) => (id === 'm1' ? { ...time } : undefined),
    });
    await open({ transfers, shareCodes }, [time]);
    await fireEvent.press(await screen.findByLabelText('Sin asignar'));
    await fireEvent.press(await screen.findByText('Editar o eliminar'));
    await fireEvent.press(screen.getByText('Enviar a otra familia'));

    await fireEvent.changeText(screen.getByLabelText('Código del nadador'), 'ts-zzzzzz');
    await fireEvent.press(screen.getByText('Buscar nadador'));
    expect(await screen.findByText('Ningún nadador tiene ese código. Revísalo con su familia.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Código del nadador'), 'TS-BBBBBB');
    await fireEvent.press(screen.getByText('Buscar nadador'));
    await fireEvent.press(await screen.findByText('Enviar a Ana M.'));

    expect(await screen.findByLabelText('Enviado a Ana M. · espera respuesta')).toBeTruthy();
    expect(screen.queryByText('Editar o eliminar')).toBeNull();
    expect([...transfers.rows.values()][0]).toMatchObject({ measurementId: 'm1', athleteId: 'b2', status: 'pending' });

    await fireEvent.press(screen.getByText('Retirar envío'));
    await waitFor(() => expect(screen.queryByLabelText('Enviado a Ana M. · espera respuesta')).toBeNull());
    expect([...transfers.rows.values()][0].status).toBe('withdrawn');
    expect(screen.getByText('Editar o eliminar')).toBeTruthy();
  });

  it('is not offered without the share code lookup', async () => {
    await open({}, [{ ...time, athleteId: 'a1' }]);
    await fireEvent.press(await screen.findByText('Editar o eliminar'));
    expect(screen.queryByText('Enviar a otra familia')).toBeNull();
  });
});

describe('answering a time another family sent', () => {
  const request = (over: Partial<FamilyTransfer> = {}) => ({
    ...time,
    id: 't1',
    measurementId: 'm9',
    fromUserId: 'u2',
    athleteId: 'a1',
    athleteShortName: 'Lucía R.',
    createdAt: '2026-11-14T11:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    millis: 41_250,
    status: 'pending' as const,
    ...over,
  });

  it('accepts it: the request goes and the time is among the swimmer’s times', async () => {
    let repository: ReturnType<typeof createInMemoryFamilyMeasurementRepository> | undefined;
    const transfers = createInMemoryFamilyTransferRepository({
      userId: 'u1',
      initial: [request()],
      // What the server does in the same transaction: the time is now this family's.
      onAccept: (t) => repository?.add({ ...time, id: t.measurementId, athleteId: t.athleteId, millis: t.millis }),
    });
    repository = await open({ transfers, shareCodes });
    expect(await screen.findByLabelText('Otra familia te envió este tiempo')).toBeTruthy();
    expect(screen.getByText('41,25')).toBeTruthy();

    await fireEvent.press(screen.getByText('Aceptar tiempo'));
    await waitFor(() => expect(screen.queryByLabelText('Otra familia te envió este tiempo')).toBeNull());
    expect(await screen.findByText('41,25')).toBeTruthy();
    expect((await repository.listByAthlete('a1')).map((m) => m.id)).toEqual(['m9']);
  });

  it('rejects it: the request goes and nothing is added', async () => {
    const transfers = createInMemoryFamilyTransferRepository({ initial: [request()] });
    const repository = await open({ transfers, shareCodes });
    await fireEvent.press(await screen.findByText('No aceptar'));
    await waitFor(() => expect(screen.queryByLabelText('Otra familia te envió este tiempo')).toBeNull());
    expect(transfers.rows.get('t1')?.status).toBe('rejected');
    expect(await repository.listByAthlete('a1')).toEqual([]);
  });

  it('does not show a request older than 30 days', async () => {
    const transfers = createInMemoryFamilyTransferRepository({ initial: [request({ expiresAt: '2026-11-01T00:00:00.000Z' })] });
    await open({ transfers, shareCodes });
    expect(await screen.findByText('Aún no hay tiempos')).toBeTruthy();
    expect(screen.queryByLabelText('Otra familia te envió este tiempo')).toBeNull();
  });

  it('says so when the answer does not go through', async () => {
    const transfers = createInMemoryFamilyTransferRepository({ initial: [request()], failing: true });
    await open({ transfers, shareCodes });
    await fireEvent.press(await screen.findByText('Aceptar tiempo'));
    expect(await screen.findByText('No pudimos hacerlo. Revisa la señal e inténtalo de nuevo.')).toBeTruthy();
    expect(screen.getByLabelText('Otra familia te envió este tiempo')).toBeTruthy();
  });
});
