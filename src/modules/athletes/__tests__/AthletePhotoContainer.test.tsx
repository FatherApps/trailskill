import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeProvider } from '../../../core/theme';
import {
  AthletePhotoContainer,
  createAthletePhotoService,
  createInMemoryLocalPhotoFiles,
  createInMemoryPhotoObjects,
  createInMemoryPhotoPicker,
  createInMemoryPhotoRows,
  createInMemoryPhotoUploadQueue,
  type PhotoPickResult,
} from '..';

// Synthetic data only. The local database read is faked; the service runs over in-memory ports, so what the screen asks is what the log shows.
const mockQuery = jest.fn();

jest.mock('../../../core/sync', () => ({
  supabase: {},
  db: {},
  useQuery: (...args: unknown[]) => mockQuery(...args),
  writeRecord: jest.fn(),
  deleteRecord: jest.fn(),
  RecordSyncStatus: ({ table, id }: { table: string; id: string }) => {
    const { Text: Label } = jest.requireActual('react-native');
    return <Label>{`sync ${table} ${id}`}</Label>;
  },
}));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: { cache: '', document: '' } }));

const A1 = 'a1111111-1111-4111-8111-111111111111';
const U1 = 'u1111111-1111-4111-8111-111111111111';
const ID_1 = '11111111-1111-4111-8111-111111111111';

function setup(results: PhotoPickResult[] = [], props: { authorized?: boolean; online?: boolean } = {}) {
  const log: string[] = [];
  const rows = createInMemoryPhotoRows(log);
  const service = createAthletePhotoService({
    queue: createInMemoryPhotoUploadQueue(),
    objects: createInMemoryPhotoObjects(log),
    rows,
    files: createInMemoryLocalPhotoFiles(log),
    newId: () => ID_1,
  });
  const picker = createInMemoryPhotoPicker(results);
  const onAuthorize = jest.fn();
  const view = (
    <ThemeProvider>
      <AthletePhotoContainer
        athleteId={A1}
        userId={U1}
        authorized={props.authorized ?? true}
        online={props.online ?? true}
        service={service}
        picker={picker}
        avatar={<Text>avatar</Text>}
        onAuthorize={onAuthorize}
      />
    </ThemeProvider>
  );
  return { log, rows, service, picker, onAuthorize, view };
}

const local = (row_id: string | null, waiting = 0) => mockQuery.mockReturnValue({ data: [{ row_id, waiting }] });

beforeEach(() => {
  mockQuery.mockReset();
  local(null);
});

describe('AthletePhotoContainer', () => {
  it('without show_photo the only button opens the authorization, never the picker', async () => {
    const { view, picker, onAuthorize } = setup([], { authorized: false });
    await render(view);

    expect(screen.queryByRole('button', { name: 'Tomar foto' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Autorizar y agregar foto' }));

    expect(onAuthorize).toHaveBeenCalledTimes(1);
    expect(picker.requested).toEqual([]);
  });

  it('with show_photo and no photo it offers the camera and the gallery', async () => {
    const { view } = setup();
    await render(view);

    expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Elegir de la galería' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Quitar foto' })).toBeNull();
  });

  it.each([
    ['Tomar foto', 'camera'],
    ['Elegir de la galería', 'library'],
  ] as const)('%s asks the picker for the %s and keeps what it returns', async (label, source) => {
    const { view, picker, log } = setup([{ status: 'picked', uri: 'file:///cache/out.jpg' }]);
    await render(view);

    await fireEvent.press(screen.getByRole('button', { name: label }));

    await waitFor(() => expect(log).toContain(`row-save ${A1}/${ID_1}.jpg`));
    expect(picker.requested).toEqual([source]);
    // The object went up before the row was written.
    expect(log.indexOf(`upload ${A1}/${ID_1}.jpg`)).toBeLessThan(log.indexOf(`row-save ${A1}/${ID_1}.jpg`));
  });

  it('closing the picker changes nothing', async () => {
    const { view, log } = setup([{ status: 'cancelled' }]);
    await render(view);

    await fireEvent.press(screen.getByRole('button', { name: 'Tomar foto' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Tomar foto' })).toBeOnTheScreen());
    expect(log).toEqual([]);
    expect(screen.queryByText(/No pudimos/)).toBeNull();
  });

  it('a refused camera permission says so and points to the gallery', async () => {
    const { view } = setup([{ status: 'denied' }]);
    await render(view);

    await fireEvent.press(screen.getByRole('button', { name: 'Tomar foto' }));

    expect(await screen.findByText(/No tenemos permiso para usar la cámara/)).toBeOnTheScreen();
  });

  it('a photo that cannot be kept says so', async () => {
    const { view, picker } = setup();
    jest.spyOn(picker, 'pick').mockRejectedValue(new Error('boom'));
    await render(view);

    await fireEvent.press(screen.getByRole('button', { name: 'Tomar foto' }));

    expect(await screen.findByText('No pudimos guardar la foto. Inténtalo de nuevo.')).toBeOnTheScreen();
  });

  it('a photo waiting on the phone shows as not sent yet', async () => {
    local(null, 1);
    const { view } = setup();
    await render(view);

    expect(screen.getByText('La foto quedó guardada en este teléfono y se enviará cuando haya señal.')).toBeOnTheScreen();
    expect(screen.getByText('Esperando señal para enviarse')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Quitar foto' })).toBeOnTheScreen();
  });

  it('a stored photo shows its sync state and the buttons to change or remove it', async () => {
    local('row-1');
    const { view } = setup();
    await render(view);

    expect(screen.getByText('sync athlete_photos row-1')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tomar otra foto' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Elegir otra de la galería' })).toBeOnTheScreen();
  });

  describe('removing', () => {
    async function withStoredPhoto(props: { online?: boolean } = {}) {
      local('row-1');
      const ctx = setup([{ status: 'picked', uri: 'file:///cache/out.jpg' }], props);
      await ctx.service.add(A1, 'file:///cache/out.jpg', U1);
      ctx.log.length = 0;
      await render(ctx.view);
      return ctx;
    }

    it('asks first and keeps the photo when the person chooses to keep it', async () => {
      const { log } = await withStoredPhoto();

      await fireEvent.press(screen.getByRole('button', { name: 'Quitar foto' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Conservarla' }));

      expect(log).toEqual([]);
    });

    it('deletes the object first and the row after it', async () => {
      const { log, rows } = await withStoredPhoto();

      await fireEvent.press(screen.getByRole('button', { name: 'Quitar foto' }));
      // Two buttons carry the name: the card's and the sheet's confirmation, which opens last.
      await fireEvent.press((await screen.findAllByRole('button', { name: 'Quitar foto' })).at(-1)!);

      await waitFor(() => expect(rows.stored(A1)).toBeNull());
      expect(log).toEqual([`object-remove ${A1}/${ID_1}.jpg`, `row-remove ${A1}/${ID_1}.jpg`]);
    });

    it('without signal it does not ask: the object cannot be deleted', async () => {
      const { log } = await withStoredPhoto({ online: false });

      await fireEvent.press(screen.getByRole('button', { name: 'Quitar foto' }));

      expect(screen.getByText('Para quitar la foto necesitas señal. Inténtalo cuando la tengas.')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Conservarla' })).toBeNull();
      expect(log).toEqual([]);
    });
  });

  it('without show_photo a photo waiting to be sent is dropped from the phone', async () => {
    local(null, 1);
    const { view, service } = setup([], { authorized: false });
    const discard = jest.spyOn(service, 'discard');
    await render(view);

    expect(discard).toHaveBeenCalledWith(A1);
  });
});
