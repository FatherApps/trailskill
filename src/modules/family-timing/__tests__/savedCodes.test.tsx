import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { createInMemoryFamilyTransferRepository } from '../data/familyTransfers';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, supabase: {}, useRecordSyncStates: () => new Map() }));

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [], endedAt: null }];

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

type Kept = { id: string; code: string; athleteShortName: string; expiredAt?: string | null };

function keptCodes(rows: Kept[], failing = false) {
  const kept = [...rows];
  return {
    kept,
    list: jest.fn(async (_userId: string, options?: { includeExpired?: boolean }) =>
      kept.filter((k) => options?.includeExpired || !k.expiredAt).map((k) => ({ ...k, expiredAt: k.expiredAt ?? null })),
    ),
    forget: jest.fn(async (id: string) => {
      if (failing) throw new Error('no signal');
      kept.splice(kept.findIndex((k) => k.id === id), 1);
    }),
  };
}

async function openSend(
  savedCodes: ReturnType<typeof keptCodes>,
  options: { codes?: Record<string, { athleteId: string; shortName: string }>; find?: () => Promise<string | null> } = {},
) {
  const transfers = createInMemoryFamilyTransferRepository({
    codes: options.codes ?? { 'TS-BBBBBB': { athleteId: 'b2', shortName: 'Ana M.' }, 'TS-CCCCCC': { athleteId: 'b3', shortName: 'Luis P.' } },
    measurements: (id) => (id === 'm1' ? { ...time } : undefined),
  });
  const shareCodes = { find: jest.fn(options.find ?? (async () => null)) };
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
    expect(saved.list).toHaveBeenCalledWith('u1', { includeExpired: true });
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

  describe('a code its family changed (issue #1321)', () => {
    const expired = { id: 's1', code: 'TS-BBBBBB', athleteShortName: 'Ana M.', expiredAt: '2026-11-20T10:00:00.000Z' };
    const message = 'El código de Ana M. caducó: su familia lo cambió. Pídeles el código nuevo';

    it('lists it as expired, and touching it explains it once and removes it', async () => {
      const saved = keptCodes([expired, { id: 's2', code: 'TS-CCCCCC', athleteShortName: 'Luis P.' }]);
      await openSend(saved);
      expect(saved.list).toHaveBeenCalledWith('u1', { includeExpired: true });
      await fireEvent.press(await screen.findByLabelText('Ana M. · TS-BBBBBB · caducó'));
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByText('Ingresar código nuevo')).toBeTruthy();
      expect(screen.queryByText('Enviar a Ana M.')).toBeNull();
      await waitFor(() => expect(saved.forget).toHaveBeenCalledTimes(1));
      expect(saved.forget).toHaveBeenCalledWith('s1');
      await waitFor(() => expect(screen.queryByLabelText('Ana M. · TS-BBBBBB · caducó')).toBeNull());
      expect(screen.getByLabelText('Luis P. · TS-CCCCCC')).toBeTruthy();
    });

    it('«Ingresar código nuevo» leaves the code field empty', async () => {
      await openSend(keptCodes([expired, { id: 's2', code: 'TS-CCCCCC', athleteShortName: 'Luis P.' }]));
      await fireEvent.changeText(await screen.findByLabelText('O escribe un código nuevo'), 'TS-ZZZZZZ');
      await fireEvent.press(screen.getByLabelText('Ana M. · TS-BBBBBB · caducó'));
      await fireEvent.press(await screen.findByText('Ingresar código nuevo'));
      expect(screen.getByLabelText('O escribe un código nuevo').props.value).toBe('');
      expect(screen.queryByText(message)).toBeNull();
    });

    it('keeps it expired and unpickable when removing fails, and tries again on the next touch', async () => {
      const saved = keptCodes([expired], true);
      await openSend(saved);
      await fireEvent.press(await screen.findByLabelText('Ana M. · TS-BBBBBB · caducó'));
      expect(await screen.findByText(message)).toBeTruthy();
      await waitFor(() => expect(saved.forget).toHaveBeenCalledTimes(1));
      expect(screen.getByLabelText('Ana M. · TS-BBBBBB · caducó')).toBeTruthy();
      expect(screen.queryByText('Enviar a Ana M.')).toBeNull();
      await fireEvent.press(screen.getByLabelText('Ana M. · TS-BBBBBB · caducó'));
      await waitFor(() => expect(saved.forget).toHaveBeenCalledTimes(2));
      expect(screen.queryByText('Enviar a Ana M.')).toBeNull();
    });

    it('treats a kept code the server no longer knows as expired: same message, entry removed', async () => {
      const saved = keptCodes([{ id: 's1', code: 'TS-BBBBBB', athleteShortName: 'Ana M.' }]);
      const { transfers } = await openSend(saved, { codes: {} });
      await fireEvent.press(await screen.findByLabelText('Ana M. · TS-BBBBBB'));
      await fireEvent.press(await screen.findByText('Enviar a Ana M.'));
      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByText('Ingresar código nuevo')).toBeTruthy();
      await waitFor(() => expect(saved.forget).toHaveBeenCalledWith('s1'));
      expect(transfers.rows.size).toBe(0);
      expect(screen.queryByText('Ningún nadador tiene ese código. Revísalo con su familia.')).toBeNull();
    });

    it('keeps the unknown-code error for a code typed by hand', async () => {
      const saved = keptCodes([{ id: 's1', code: 'TS-BBBBBB', athleteShortName: 'Ana M.' }]);
      await openSend(saved, { codes: {}, find: async () => 'Ana M.' });
      await fireEvent.changeText(await screen.findByLabelText('O escribe un código nuevo'), 'TS-ZZZZZZ');
      await fireEvent.press(screen.getByText('Buscar nadador'));
      await fireEvent.press(await screen.findByText('Enviar a Ana M.'));
      expect(await screen.findByText('Ningún nadador tiene ese código. Revísalo con su familia.')).toBeTruthy();
      expect(screen.queryByText(message)).toBeNull();
      expect(saved.forget).not.toHaveBeenCalled();
    });
  });
});
