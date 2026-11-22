import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { createInMemoryFamilyTransferRepository } from '../data/familyTransfers';
import { createInMemoryFamilyTimingNoticeStore } from '../data/noticeSeen';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';
import { createFakeQrScanner } from '../testing/fakeQrScanner';

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

async function openSend(
  options: {
    scanner?: ReturnType<typeof createFakeQrScanner> | null;
    scanIntro?: ReturnType<typeof createInMemoryFamilyTimingNoticeStore>;
    find?: (code: string) => Promise<string | null>;
  } = {},
) {
  const transfers = createInMemoryFamilyTransferRepository({
    codes: { 'TS-AAAAAA': { athleteId: 'b2', shortName: 'Ana M.' } },
    measurements: (id) => (id === 'm1' ? { ...time } : undefined),
  });
  const shareCodes = { find: jest.fn(options.find ?? (async (code: string) => (code === 'TS-AAAAAA' ? 'Ana M.' : null))) };
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'hundredths' })}>
      <FamilyTimingContainer
        userId="u1"
        athletes={athletes}
        repository={createInMemoryFamilyMeasurementRepository([time])}
        transfers={transfers}
        shareCodes={shareCodes}
        qrScanner={options.scanner === null ? undefined : options.scanner?.scanner}
        scanIntro={options.scanIntro}
        onBack={jest.fn()}
      />
    </PreferencesProvider>,
  );
  await fireEvent.press(await screen.findByLabelText('Sin asignar'));
  await fireEvent.press((await screen.findAllByHintText('Abre el detalle del tiempo'))[0]);
  await fireEvent.press(await screen.findByText('Editar registro'));
  await fireEvent.press(screen.getByText('Enviar a otra familia'));
  return { shareCodes, transfers };
}

const field = () => screen.getByLabelText('Código del nadador');

describe('scanning the swimmer code QR in the send step (issue 1322)', () => {
  it('does not offer «Escanear QR» without a scanner', async () => {
    await openSend({ scanner: null });
    expect(await screen.findByLabelText('Código del nadador')).toBeTruthy();
    expect(screen.queryByText('Escanear QR')).toBeNull();
  });

  it('fills the code field with a scanned code and looks the swimmer up as if it was typed', async () => {
    const fake = createFakeQrScanner();
    const { shareCodes } = await openSend({ scanner: fake });
    await fireEvent.press(await screen.findByText('Escanear QR'));
    await waitFor(() => expect(fake.state.mounted).toBe(true));
    await act(async () => fake.scan('TS-AAAAAA'));
    expect(await screen.findByText('Enviar a Ana M.')).toBeTruthy();
    expect(shareCodes.find).toHaveBeenCalledWith('TS-AAAAAA');
    expect(field().props.value).toBe('TS-AAAAAA');
    expect(fake.state.mounted).toBe(false);
  });

  it('a scanned code nobody has gets the same answer as a typed one', async () => {
    const fake = createFakeQrScanner();
    await openSend({ scanner: fake });
    await fireEvent.press(await screen.findByText('Escanear QR'));
    await waitFor(() => expect(fake.state.mounted).toBe(true));
    await act(async () => fake.scan('TS-BBBBBB'));
    expect(await screen.findByText('Ningún nadador tiene ese código. Revísalo con su familia.')).toBeTruthy();
    expect(field().props.value).toBe('TS-BBBBBB');
  });

  it('fills nothing and says so when the QR is not a share code', async () => {
    const fake = createFakeQrScanner();
    const { shareCodes } = await openSend({ scanner: fake });
    await fireEvent.press(await screen.findByText('Escanear QR'));
    await waitFor(() => expect(fake.state.mounted).toBe(true));
    await act(async () => fake.scan('https://example.test/TS-AAAAAA'));
    expect(await screen.findByText('Ese QR no es un código de Swimcro. Escanea el QR del perfil del nadador o escribe el código.')).toBeTruthy();
    expect(field().props.value).toBe('');
    expect(shareCodes.find).not.toHaveBeenCalled();
  });

  it('explains the camera before the first permission, and not again', async () => {
    const fake = createFakeQrScanner();
    const scanIntro = createInMemoryFamilyTimingNoticeStore();
    await openSend({ scanner: fake, scanIntro });
    await fireEvent.press(await screen.findByText('Escanear QR'));
    expect(await screen.findByText('Antes de escanear')).toBeTruthy();
    expect(screen.getByText(/La imagen no se guarda/)).toBeTruthy();
    expect(fake.state.asked).toBe(0);
    await fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(fake.state.mounted).toBe(true));
    expect(fake.state.asked).toBe(1);
    await fireEvent.press(screen.getByText('Escribir el código'));
    await fireEvent.press(await screen.findByText('Escanear QR'));
    await waitFor(() => expect(fake.state.asked).toBe(2));
    expect(screen.queryByText('Antes de escanear')).toBeNull();
  });

  it('keeps the code field when the camera permission is denied', async () => {
    const fake = createFakeQrScanner({ granted: false });
    await openSend({ scanner: fake });
    await fireEvent.press(await screen.findByText('Escanear QR'));
    expect(await screen.findByText('Sin permiso de cámara no podemos escanear. Puedes escribir el código.')).toBeTruthy();
    expect(fake.state.mounted).toBe(false);
    await fireEvent.changeText(field(), 'TS-AAAAAA');
    await fireEvent.press(screen.getByText('Buscar nadador'));
    expect(await screen.findByText('Enviar a Ana M.')).toBeTruthy();
  });

  it('keeps the code field when the camera cannot open', async () => {
    const fake = createFakeQrScanner();
    await openSend({ scanner: fake });
    await fireEvent.press(await screen.findByText('Escanear QR'));
    await waitFor(() => expect(fake.state.mounted).toBe(true));
    await act(async () => fake.fail());
    expect(await screen.findByText('No pudimos abrir la cámara. Puedes escribir el código.')).toBeTruthy();
    expect(field()).toBeTruthy();
  });

  it('goes back to typing with «Escribir el código»', async () => {
    const fake = createFakeQrScanner();
    await openSend({ scanner: fake });
    await fireEvent.press(await screen.findByText('Escanear QR'));
    await waitFor(() => expect(fake.state.mounted).toBe(true));
    await fireEvent.press(screen.getByText('Escribir el código'));
    expect(await screen.findByLabelText('Código del nadador')).toBeTruthy();
    expect(fake.state.mounted).toBe(false);
  });

  it('looks a code up once when the camera reports the same QR several times', async () => {
    const fake = createFakeQrScanner();
    const { shareCodes } = await openSend({ scanner: fake });
    await fireEvent.press(await screen.findByText('Escanear QR'));
    await waitFor(() => expect(fake.state.mounted).toBe(true));
    await act(async () => {
      fake.scan('TS-AAAAAA');
      fake.scan('TS-AAAAAA');
      fake.scan('https://example.test');
    });
    expect(await screen.findByText('Enviar a Ana M.')).toBeTruthy();
    expect(shareCodes.find).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Ese QR no es un código/)).toBeNull();
  });

  it('can be left while the permission dialog is open, and a late answer does not open the camera', async () => {
    const fake = createFakeQrScanner({ manual: true });
    await openSend({ scanner: fake });
    await fireEvent.press(await screen.findByText('Escanear QR'));
    await waitFor(() => expect(fake.state.asked).toBe(1));
    await fireEvent.press(screen.getByText('Escribir el código'));
    expect(await screen.findByLabelText('Código del nadador')).toBeTruthy();
    await act(async () => fake.state.answer?.(true));
    expect(fake.state.mounted).toBe(false);
    expect(screen.getByLabelText('Código del nadador')).toBeTruthy();
  });

  it('keeps the scanned code when an older typed lookup answers late (the last request wins)', async () => {
    const fake = createFakeQrScanner();
    let answerTyped: (name: string | null) => void = () => {};
    const { shareCodes } = await openSend({
      scanner: fake,
      find: (code) => (code === 'TS-AAAAAA' ? Promise.resolve('Ana M.') : new Promise((resolve) => (answerTyped = resolve))),
    });
    await fireEvent.changeText(await screen.findByLabelText('Código del nadador'), 'TS-CCCCCC');
    await fireEvent.press(screen.getByText('Buscar nadador'));
    await waitFor(() => expect(shareCodes.find).toHaveBeenCalledWith('TS-CCCCCC'));
    await fireEvent.press(screen.getByText('Escanear QR'));
    await waitFor(() => expect(fake.state.mounted).toBe(true));
    await act(async () => fake.scan('TS-AAAAAA'));
    expect(await screen.findByText('Enviar a Ana M.')).toBeTruthy();
    await act(async () => answerTyped('Luis P.'));
    expect(screen.getByText('Enviar a Ana M.')).toBeTruthy();
    expect(screen.queryByText('Enviar a Luis P.')).toBeNull();
    expect(field().props.value).toBe('TS-AAAAAA');
  });

  it('ignores a scan lookup that answers after the person typed another code', async () => {
    const fake = createFakeQrScanner();
    let answerScanned: (name: string | null) => void = () => {};
    await openSend({ scanner: fake, find: () => new Promise((resolve) => (answerScanned = resolve)) });
    await fireEvent.press(await screen.findByText('Escanear QR'));
    await waitFor(() => expect(fake.state.mounted).toBe(true));
    await act(async () => fake.scan('TS-AAAAAA'));
    await fireEvent.changeText(field(), 'TS-CCCCCC');
    await act(async () => answerScanned('Ana M.'));
    expect(screen.queryByText('Enviar a Ana M.')).toBeNull();
    expect(field().props.value).toBe('TS-CCCCCC');
    expect(screen.getByText('Buscar nadador')).toBeTruthy();
  });
});
