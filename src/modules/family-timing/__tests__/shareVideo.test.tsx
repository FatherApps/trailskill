import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { createInMemoryFamilyTransferRepository } from '../data/familyTransfers';
import { createInMemoryFamilyVideoRepository, type FamilyVideo } from '../data/familyVideos';
import { videoMatchesTime } from '../data/videoSharing';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';
import { createFakeVideoLibrary } from '../testing/fakeVideoLibrary';
import { createFakeVideoSharing } from '../testing/fakeVideoSharing';

// Issue #1201: sharing a time's video, and linking the one another family sent to the time they sent.

jest.mock('../../../core/sync', () => ({ db: {}, supabase: {}, useRecordSyncStates: () => new Map() }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

const MINE = '11111111-1111-4111-8111-111111111111';
const RECEIVED = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [] }];

const time = (over: Partial<FamilyMeasurement> = {}): FamilyMeasurement => ({
  id: MINE,
  athleteId: 'a1',
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
  ...over,
});

async function open(
  options: {
    measurements?: FamilyMeasurement[];
    links?: (FamilyVideo & { userId: string })[];
    gallery?: Record<string, string>;
    transfers?: ReturnType<typeof createInMemoryFamilyTransferRepository>;
    sharing?: boolean;
  } = {},
) {
  const repository = createInMemoryFamilyMeasurementRepository(options.measurements ?? []);
  const videos = createInMemoryFamilyVideoRepository(options.links);
  const gallery = createFakeVideoLibrary(options.gallery);
  const sharing = createFakeVideoSharing();
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'hundredths' })}>
      <FamilyTimingContainer
        userId="u1"
        athletes={athletes}
        repository={repository}
        videos={videos.repository}
        videoLibrary={gallery.library}
        videoSharing={options.sharing === false ? null : sharing.sharing}
        transfers={options.transfers}
        shareCodes={{ find: async (code: string) => (code.toUpperCase() === 'TS-BBBBBB' ? 'Ana M.' : null) }}
        onBack={jest.fn()}
      />
    </PreferencesProvider>,
  );
  return { repository, videos, gallery, sharing };
}

const withVideo = {
  links: [{ userId: 'u1', measurementId: MINE, assetId: 'content://media/video/7', startOffsetMillis: 5_000 }],
  gallery: { 'content://media/video/7': 'content://media/video/7' },
};

async function openDetail() {
  await fireEvent.press(await screen.findByHintText('Abre el detalle del tiempo'));
}

describe('which chosen video goes with a time', () => {
  it('reads the time’s id in the file name, also when an app added to it', () => {
    expect(videoMatchesTime(`Swimcro_${MINE}.mp4`, MINE)).toBe('same');
    expect(videoMatchesTime(`Swimcro_${MINE.toUpperCase()} (1).mp4`, MINE)).toBe('same');
    expect(videoMatchesTime(`Swimcro_${OTHER}.mp4`, MINE)).toBe('other');
    expect(videoMatchesTime('VID-20261119-WA0003.mp4', MINE)).toBe('unknown');
    expect(videoMatchesTime(null, MINE)).toBe('unknown');
  });
});

describe('sharing a time’s video', () => {
  it('shares the gallery video from the detail, with the advice to send it as a document', async () => {
    const { sharing } = await open({ measurements: [time()], ...withVideo });
    await openDetail();

    expect(screen.getByText(/envíalo como «Documento»/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Compartir video'));

    expect(sharing.state.shared).toEqual(['content://media/video/7']);
  });

  it('says so when the share menu does not open', async () => {
    const { sharing } = await open({ measurements: [time()], ...withVideo });
    sharing.state.shareFails = true;
    await openDetail();
    await fireEvent.press(screen.getByText('Compartir video'));

    expect(await screen.findByText('No se pudo abrir el menú para compartir. Vuelve a intentarlo.')).toBeTruthy();
  });

  it('offers it right after sending the time, and again on the card while the answer waits', async () => {
    const transfers = createInMemoryFamilyTransferRepository({
      codes: { 'TS-BBBBBB': { athleteId: 'b2', shortName: 'Ana M.' } },
      measurements: (id) => (id === MINE ? time() : undefined),
    });
    // Like the server, the time waits under "Sin asignar" while the other family answers.
    const { sharing } = await open({ measurements: [time({ athleteId: null })], ...withVideo, transfers });
    await fireEvent.press(await screen.findByLabelText('Sin asignar'));
    await openDetail();
    await fireEvent.press(screen.getByText('Editar registro'));
    await fireEvent.press(screen.getByText('Enviar a otra familia'));
    await fireEvent.changeText(screen.getByLabelText('Código del nadador'), 'TS-BBBBBB');
    await fireEvent.press(screen.getByText('Buscar nadador'));
    await fireEvent.press(await screen.findByText('Enviar a Ana M.'));
    expect(await screen.findByText('Tiempo enviado a Ana M.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Ahora no'));

    // Waiting for the answer, the time is under "Sin asignar" with its video still offered.
    expect(await screen.findByLabelText('Enviado a Ana M. · espera respuesta')).toBeTruthy();
    await fireEvent.press(screen.getByText('Compartir video'));
    expect(sharing.state.shared).toEqual(['content://media/video/7']);
  });

  it('goes straight back to the list after sending a time without a video', async () => {
    const transfers = createInMemoryFamilyTransferRepository({
      codes: { 'TS-BBBBBB': { athleteId: 'b2', shortName: 'Ana M.' } },
      measurements: (id) => (id === MINE ? time() : undefined),
    });
    await open({ measurements: [time({ athleteId: null })], transfers });
    await fireEvent.press(await screen.findByLabelText('Sin asignar'));
    await openDetail();
    await fireEvent.press(screen.getByText('Editar registro'));
    await fireEvent.press(screen.getByText('Enviar a otra familia'));
    await fireEvent.changeText(screen.getByLabelText('Código del nadador'), 'TS-BBBBBB');
    await fireEvent.press(screen.getByText('Buscar nadador'));
    await fireEvent.press(await screen.findByText('Enviar a Ana M.'));

    expect(await screen.findByLabelText('Enviado a Ana M. · espera respuesta')).toBeTruthy();
    expect(screen.queryByText('Tiempo enviado a Ana M.')).toBeNull();
  });

  it('is not offered without the video on this phone', async () => {
    await open({ measurements: [time()] });
    await openDetail();
    expect(screen.queryByText('Compartir video')).toBeNull();
  });

  it('is not offered where the phone cannot share', async () => {
    await open({ measurements: [time()], ...withVideo, sharing: false });
    await openDetail();
    expect(screen.getByText('Ver video')).toBeTruthy();
    expect(screen.queryByText('Compartir video')).toBeNull();
  });
});

describe('linking the video of a received time', () => {
  const received = time({ id: RECEIVED, createdBy: 'u2' });

  it('asks after accepting a time, and links the video whose name has the time’s id', async () => {
    let repository: ReturnType<typeof createInMemoryFamilyMeasurementRepository> | undefined;
    const transfers = createInMemoryFamilyTransferRepository({
      userId: 'u1',
      initial: [
        {
          ...received,
          id: 't1',
          measurementId: RECEIVED,
          fromUserId: 'u2',
          athleteId: 'a1',
          athleteShortName: 'Lucía R.',
          createdAt: '2026-11-14T11:00:00.000Z',
          expiresAt: '2099-01-01T00:00:00.000Z',
          status: 'pending',
        },
      ],
      onAccept: (t) => repository?.add({ ...received, id: t.measurementId }),
    });
    const opened = await open({ transfers });
    repository = opened.repository;
    opened.sharing.state.next = { uri: 'content://downloads/41', name: `Swimcro_${RECEIVED}.mp4` };

    await fireEvent.press(await screen.findByText('Aceptar tiempo'));
    expect(await screen.findByText('¿Tienes el video de este tiempo?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Vincular video'));

    expect(await screen.findByText(/Video vinculado\. Lo pasamos al álbum/)).toBeTruthy();
    expect(opened.sharing.state.adopted).toEqual([{ video: { uri: 'content://downloads/41', name: `Swimcro_${RECEIVED}.mp4` }, name: `Swimcro_${RECEIVED}` }]);
    expect(opened.videos.rows).toEqual([{ userId: 'u1', measurementId: RECEIVED, assetId: `asset-Swimcro_${RECEIVED}`, startOffsetMillis: null }]);
  });

  it('lets the family say «Ahora no» after accepting', async () => {
    const transfers = createInMemoryFamilyTransferRepository({
      userId: 'u1',
      initial: [
        {
          ...received,
          id: 't1',
          measurementId: RECEIVED,
          fromUserId: 'u2',
          athleteId: 'a1',
          athleteShortName: 'Lucía R.',
          createdAt: '2026-11-14T11:00:00.000Z',
          expiresAt: '2099-01-01T00:00:00.000Z',
          status: 'pending',
        },
      ],
    });
    const { sharing } = await open({ transfers });
    await fireEvent.press(await screen.findByText('Aceptar tiempo'));
    await fireEvent.press(await screen.findByText('Ahora no'));

    expect(await screen.findByText('Medir un tiempo')).toBeTruthy();
    expect(sharing.state.picks).toBe(0);
  });

  it('offers it later in the detail of a received time, never of one’s own', async () => {
    await open({ measurements: [received, time()] });
    const cards = await screen.findAllByHintText('Abre el detalle del tiempo');
    expect(cards).toHaveLength(2);

    await fireEvent.press(cards[0]);
    expect(screen.getByText('Vincular video')).toBeTruthy();
    await fireEvent.press(screen.getByText('Volver a la lista'));
    await fireEvent.press((await screen.findAllByHintText('Abre el detalle del tiempo'))[1]);
    expect(screen.queryByText('Vincular video')).toBeNull();
  });

  it('does not link a video of another time, and lets the person choose again', async () => {
    const { sharing, videos } = await open({ measurements: [received] });
    sharing.state.next = { uri: 'content://downloads/41', name: `Swimcro_${OTHER}.mp4` };
    await openDetail();
    await fireEvent.press(screen.getByText('Vincular video'));

    expect(await screen.findByText(/Este video es de otro tiempo/)).toBeTruthy();
    expect(screen.queryByText('Vincular de todos modos')).toBeNull();
    expect(sharing.state.adopted).toEqual([]);

    sharing.state.next = { uri: 'content://downloads/42', name: `Swimcro_${RECEIVED}.mp4` };
    await fireEvent.press(screen.getByText('Elegir otro video'));
    await waitFor(() => expect(videos.rows).toHaveLength(1));
    expect(sharing.state.adopted[0]?.video.uri).toBe('content://downloads/42');
  });

  it('asks before linking a video whose name has no time’s id', async () => {
    const { sharing, videos } = await open({ measurements: [received] });
    sharing.state.next = { uri: 'content://downloads/43', name: 'VID-20261119-WA0003.mp4' };
    sharing.state.removable = false;
    await openDetail();
    await fireEvent.press(screen.getByText('Vincular video'));

    expect(await screen.findByText(/No pudimos comprobar que sea el video de este tiempo/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Vincular de todos modos'));

    expect(await screen.findByText(/El archivo que recibiste quedó donde estaba/)).toBeTruthy();
    expect(videos.rows).toHaveLength(1);
  });

  it('keeps nothing linked and says so when the gallery refuses the video', async () => {
    const { sharing, videos } = await open({ measurements: [received] });
    sharing.state.next = { uri: 'content://downloads/41', name: `Swimcro_${RECEIVED}.mp4` };
    sharing.state.adoptFails = true;
    await openDetail();
    await fireEvent.press(screen.getByText('Vincular video'));

    expect(await screen.findByText(/No se pudo vincular el video/)).toBeTruthy();
    expect(videos.rows).toEqual([]);
  });

  it('does nothing when the person goes back from the picker', async () => {
    const { sharing, videos } = await open({ measurements: [received] });
    await openDetail();
    await fireEvent.press(screen.getByText('Vincular video'));

    await waitFor(() => expect(sharing.state.picks).toBe(1));
    expect(screen.getByText('Vincular video')).toBeTruthy();
    expect(videos.rows).toEqual([]);
  });

  it('plays a linked video without «Ir a la salida»', async () => {
    await open({
      measurements: [received],
      links: [{ userId: 'u1', measurementId: RECEIVED, assetId: 'content://media/video/9', startOffsetMillis: null }],
      gallery: { 'content://media/video/9': 'content://media/video/9' },
    });
    await fireEvent.press(await screen.findByLabelText('Ver video'));

    expect(await screen.findByLabelText('Volver')).toBeTruthy();
    expect(screen.queryByText('Ir a la salida')).toBeNull();
  });
});
