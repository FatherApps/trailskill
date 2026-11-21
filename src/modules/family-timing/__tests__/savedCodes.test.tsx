import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { createInMemoryFamilyTransferRepository } from '../data/familyTransfers';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, supabase: {}, useRecordSyncStates: () => new Map() }));

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

function keptCodes(rows: { id: string; code: string; athleteShortName: string }[], failing = false) {
  const kept = [...rows];
  return {
    kept,
    list: jest.fn(async () => [...kept]),
    forget: jest.fn(async (id: string) => {
      if (failing) throw new Error('no signal');
      kept.splice(kept.findIndex((k) => k.id === id), 1);
    }),
  };
}

async function openSend(savedCodes: ReturnType<typeof keptCodes>) {
  const transfers = createInMemoryFamilyTransferRepository({
    codes: { 'TS-BBBBBB': { athleteId: 'b2', shortName: 'Ana M.' }, 'TS-CCCCCC': { athleteId: 'b3', shortName: 'Luis P.' } },
    measurements: (id) => (id === 'm1' ? { ...time } : undefined),
  });
  const shareCodes = { find: jest.fn(async () => null) };
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'hundredths' })}>
      <FamilyTimingContainer
        userId="u1"
        athletes={athletes}
        repository={createInMemoryFamilyMeasurementRepository([time])}
        transfers={transfers}
        shareCodes={shareCodes}
        savedCodes={savedCodes}
        onBack={jest.fn()}
      />
    </PreferencesProvider>,
  );
  await fireEvent.press(await screen.findByLabelText('Sin asignar'));
  await fireEvent.press((await screen.findAllByHintText('Abre el detalle del tiempo'))[0]);
  await fireEvent.press(await screen.findByText('Editar registro'));
  await fireEvent.press(screen.getByText('Enviar a otra familia'));
  return { transfers, shareCodes };
}

describe('the share codes kept from other families (issue #1302)', () => {
  it('sends with a kept code picked from the list, without typing it or looking it up', async () => {
    const saved = keptCodes([{ id: 's1', code: 'TS-BBBBBB', athleteShortName: 'Ana M.' }]);
    const { transfers, shareCodes } = await openSend(saved);
    expect(saved.list).toHaveBeenCalledWith('u1');
    await fireEvent.press(await screen.findByLabelText('Ana M. · TS-BBBBBB'));
    await fireEvent.press(await screen.findByText('Enviar a Ana M.'));
    await waitFor(() => expect([...transfers.rows.values()][0]).toMatchObject({ measurementId: 'm1', athleteId: 'b2', status: 'pending' }));
    expect(shareCodes.find).not.toHaveBeenCalled();
  });

  it('still takes a new code typed by hand', async () => {
    await openSend(keptCodes([{ id: 's1', code: 'TS-BBBBBB', athleteShortName: 'Ana M.' }]));
    expect(await screen.findByText('Códigos guardados')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('O escribe un código nuevo'), 'TS-ZZZZZZ');
    await fireEvent.press(screen.getByText('Buscar nadador'));
    expect(await screen.findByText('Ningún nadador tiene ese código. Revísalo con su familia.')).toBeTruthy();
  });

  it('removes a kept code with «Quitar código guardado»', async () => {
    const saved = keptCodes([
      { id: 's1', code: 'TS-BBBBBB', athleteShortName: 'Ana M.' },
      { id: 's2', code: 'TS-CCCCCC', athleteShortName: 'Luis P.' },
    ]);
    await openSend(saved);
    expect(screen.queryByText('Quitar código guardado')).toBeNull();
    await fireEvent.press(await screen.findByLabelText('Ana M. · TS-BBBBBB'));
    await fireEvent.press(screen.getByText('Quitar código guardado'));
    await waitFor(() => expect(saved.forget).toHaveBeenCalledWith('s1'));
    await waitFor(() => expect(screen.queryByLabelText('Ana M. · TS-BBBBBB')).toBeNull());
    expect(screen.getByLabelText('Luis P. · TS-CCCCCC')).toBeTruthy();
  });

  it('shows the plain code field when nothing is kept', async () => {
    await openSend(keptCodes([]));
    expect(await screen.findByLabelText('Código del nadador')).toBeTruthy();
    expect(screen.queryByText('Códigos guardados')).toBeNull();
  });

  it('says so when removing fails, and keeps the code', async () => {
    await openSend(keptCodes([{ id: 's1', code: 'TS-BBBBBB', athleteShortName: 'Ana M.' }], true));
    await fireEvent.press(await screen.findByLabelText('Ana M. · TS-BBBBBB'));
    await fireEvent.press(screen.getByText('Quitar código guardado'));
    expect(await screen.findByText('No pudimos hacerlo. Revisa la señal e inténtalo de nuevo.')).toBeTruthy();
    expect(screen.getByLabelText('Ana M. · TS-BBBBBB')).toBeTruthy();
  });
});
