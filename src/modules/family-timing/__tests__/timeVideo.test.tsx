import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createFakeTimingButton } from '../../timing';
import { createInMemoryFamilyMeasurementRepository, type FamilyMeasurement } from '../data/familyMeasurements';
import { createInMemoryFamilyVideoRepository, type FamilyVideo } from '../data/familyVideos';
import { createFakeVideoCamera } from '../testing/fakeVideoCamera';
import { createFakeVideoLibrary } from '../testing/fakeVideoLibrary';
import { FamilyTimingContainer, JUMP_LEAD_MILLIS } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, useRecordSyncStates: () => new Map() }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

const ms = (n: number) => BigInt(n) * 1_000_000n;

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [] }];

const timed: FamilyMeasurement = {
  id: 'm1',
  athleteId: 'a1',
  createdBy: 'u1',
  stroke: 'FR',
  distance: '50m',
  pool: 'SCM',
  sessionType: 'training',
  competition: null,
  capturedAt: '2026-11-08T14:00:00.000Z',
  millis: 31_450,
  splits: [],
  officialMillis: null,
  officialSetAt: null,
};

async function setup(options: { measurements?: FamilyMeasurement[]; links?: (FamilyVideo & { userId: string })[]; gallery?: Record<string, string> } = {}) {
  const buttons = createFakeTimingButton(ms(10_000));
  const camera = createFakeVideoCamera();
  const videos = createInMemoryFamilyVideoRepository(options.links);
  const gallery = createFakeVideoLibrary(options.gallery);
  const repository = createInMemoryFamilyMeasurementRepository(options.measurements ?? []);
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository({ ...defaultPreferences, timePrecision: 'thousandths' })}>
      <FamilyTimingContainer
        userId="u1"
        athletes={athletes}
        repository={repository}
        buttons={buttons.port}
        videoCamera={camera.camera}
        videos={videos.repository}
        videoLibrary={gallery.library}
        onBack={jest.fn()}
      />
    </PreferencesProvider>,
  );
  return { buttons, camera, videos, gallery, repository };
}

describe('the video of a time in Mis tiempos', () => {
  it('links a time recorded with the camera to its video, with where the clock started', async () => {
    const { buttons, camera, videos } = await setup();
    await fireEvent.press(await screen.findByText('Medir un tiempo'));
    await fireEvent.press(screen.getByText('Piscina de 25 m'));
    await fireEvent.press(screen.getByText('Ir al cronómetro'));
    await fireEvent.press(screen.getByText('Grabar'));
    await waitFor(() => expect(camera.state.ready).not.toBeNull());
    await act(async () => camera.state.ready?.());

    await fireEvent.press(screen.getByText('Grabar'));
    buttons.advance(ms(4_000));
    await fireEvent.press(screen.getByText('Iniciar'));
    buttons.advance(ms(31_450));
    await fireEvent.press(screen.getByText('Detener'));
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(screen.getByText('Tiempo guardado. El video termina de grabar y se guarda en la Galería.')).toBeTruthy());
    await act(async () => camera.finish());

    await waitFor(() => expect(videos.rows).toHaveLength(1));
    expect(videos.rows[0]).toEqual({ userId: 'u1', measurementId: camera.state.kept[0]!.name.replace('Swimcro_', ''), assetId: 'asset-1', startOffsetMillis: 4_000 });
  });

  it('shows the video badge on a time with a video and plays it, with a jump to the start', async () => {
    const { gallery } = await setup({
      measurements: [timed],
      links: [{ userId: 'u1', measurementId: 'm1', assetId: 'asset-7', startOffsetMillis: 5_000 }],
      gallery: { 'asset-7': 'content://media/video/7' },
    });

    await fireEvent.press(await screen.findByLabelText('Ver video'));

    expect(await screen.findByText('Ir a la salida')).toBeTruthy();
    expect(gallery.state.opened).toContain('content://media/video/7');
    await fireEvent.press(screen.getByText('Ir a la salida'));
    expect(gallery.state.seeks).toEqual([5_000 - JUMP_LEAD_MILLIS]);

    await fireEvent.press(screen.getByLabelText('Volver'));
    expect(await screen.findByLabelText('Ver video')).toBeTruthy();
  });

  it('opens the video from the detail too, and goes back to the detail', async () => {
    await setup({
      measurements: [timed],
      links: [{ userId: 'u1', measurementId: 'm1', assetId: 'asset-7', startOffsetMillis: 5_000 }],
      gallery: { 'asset-7': 'content://media/video/7' },
    });
    await fireEvent.press(await screen.findByHintText('Abre el detalle del tiempo'));
    expect(await screen.findByText('Volver a la lista')).toBeTruthy();

    await fireEvent.press(screen.getByText('Ver video'));
    await fireEvent.press(await screen.findByLabelText('Volver'));

    expect(await screen.findByText('Volver a la lista')).toBeTruthy();
  });

  it('disables «Ver video» when the video was deleted from the gallery', async () => {
    const { gallery } = await setup({
      measurements: [timed],
      links: [{ userId: 'u1', measurementId: 'm1', assetId: 'asset-7', startOffsetMillis: 5_000 }],
    });

    const button = await screen.findByLabelText('Ver video · Ya no está en este teléfono');
    await fireEvent.press(button);

    expect(screen.queryByText('Ir a la salida')).toBeNull();
    expect(gallery.state.opened).toEqual([]);
  });

  it('shows a time without a video on this phone without the button', async () => {
    await setup({ measurements: [timed] });

    expect(await screen.findByText('31,450')).toBeTruthy();
    expect(screen.queryByText('Ver video')).toBeNull();
    expect(screen.queryByLabelText('Ver video')).toBeNull();
  });
});
