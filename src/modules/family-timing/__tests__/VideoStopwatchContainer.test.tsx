import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, defaultVideoRecording, PreferencesProvider, type VideoRecordingPreferences } from '../../../core/preferences';
import { createFakeTimingButton } from '../../timing';
import { createFakeDoNotDisturb } from '../data/doNotDisturb';
import { createInMemoryFamilyTimingNoticeStore } from '../data/noticeSeen';
import { createFakeVideoCamera } from '../testing/fakeVideoCamera';
import { finalMillis, type FamilyStopwatch } from '../domain/familyStopwatch';
import { CAMERA_OPEN_TIMEOUT_MS, LOW_SPACE_BYTES, VideoStopwatchContainer, videoName, type VideoStopwatchContainerProps, type VideoStopwatchResult } from '../screens/VideoStopwatchContainer';

jest.mock('../../../core/sync', () => ({ db: {} }));

const ms = (n: number) => BigInt(n) * 1_000_000n;

// The camera opens once the preferences are read, as in the app, where they load at start-up.
function AfterLoad({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(timer);
  }, []);
  return ready ? children : null;
}

async function setup(options: { video?: Partial<VideoRecordingPreferences>; granted?: boolean; freeBytes?: number | null; laps?: number; failToOpen?: boolean; failKeep?: boolean; intro?: VideoStopwatchContainerProps['intro']; dnd?: ReturnType<typeof createFakeDoNotDisturb> } = {}) {
  const buttons = createFakeTimingButton(ms(1000));
  const dnd = options.dnd ?? createFakeDoNotDisturb();
  const fake = createFakeVideoCamera({ granted: options.granted, freeBytes: options.freeBytes, failToOpen: options.failToOpen, failKeep: options.failKeep });
  const saved: FamilyStopwatch[] = [];
  const saveTime = jest.fn(async (sw: FamilyStopwatch) => {
    saved.push(sw);
    return 'time-1';
  });
  const onClose = jest.fn<void, [VideoStopwatchResult]>();
  const preferences = { ...defaultPreferences, timePrecision: 'thousandths' as const, videoRecording: { ...defaultVideoRecording, ...options.video } };
  await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository(preferences)}>
      <AfterLoad>
        <VideoStopwatchContainer
        event="Libre 50 m · Piscina de 25 m"
        laps={options.laps ?? 1}
        buttons={buttons.port}
        camera={fake.camera}
        intro={options.intro}
        dnd={dnd}
        saveTime={saveTime}
        buttonsHint={() => 'Subir volumen (+) inicia y detiene'}
        onClose={onClose}
        />
      </AfterLoad>
    </PreferencesProvider>,
  );
  const cameraOn = async () => {
    await waitFor(() => expect(fake.state.ready).not.toBeNull());
    await act(async () => fake.state.ready?.());
  };
  return { buttons, fake, saved, saveTime, onClose, cameraOn, dnd };
}

describe('VideoStopwatchContainer', () => {
  it('starts the clock only once the video records, and keeps recording after the stop', async () => {
    const { buttons, fake, saved, cameraOn } = await setup({ video: { stopAfterSeconds: 10 } });
    await cameraOn();

    // Iniciar shows up only once the video records.
    expect(screen.queryByText('Iniciar')).toBeNull();
    expect(screen.getByText('0,000')).toBeTruthy();

    await fireEvent.press(screen.getByText('Grabar'));
    expect(fake.state.recording).toBe(true);
    await fireEvent.press(screen.getByText('Iniciar'));
    buttons.advance(ms(31_456));
    await fireEvent.press(screen.getByText('Detener'));

    expect(fake.state.recording).toBe(true);
    expect(screen.getByText('31,456')).toBeTruthy();
    expect(screen.getByText('Guardar')).toBeTruthy();
    expect(saved).toHaveLength(0);
  });

  it('saves the time as without video, and keeps the video under the time id once it ends', async () => {
    const { buttons, fake, saved, onClose, cameraOn } = await setup({ video: { stopAfterSeconds: 10 } });
    await cameraOn();
    await fireEvent.press(screen.getByText('Grabar'));
    await fireEvent.press(screen.getByText('Iniciar'));
    buttons.advance(ms(28_100));
    await fireEvent.press(screen.getByText('Detener'));
    await fireEvent.press(screen.getByText('Guardar'));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(finalMillis(saved[0]!)).toBe(28_100);
    expect(await screen.findByText('Tiempo guardado. El video termina de grabar y se guarda en la Galería.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Parar video'));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('saved'));
    expect(fake.state.kept).toEqual([{ uri: 'file:///cache/recording-1.mp4', name: 'Swimcro_time-1' }]);
  });

  it('stops the video by itself the chosen seconds after the clock', async () => {
    const { fake, cameraOn } = await setup({ video: { stopAfterSeconds: 0 } });
    await cameraOn();
    await fireEvent.press(screen.getByText('Grabar'));
    await fireEvent.press(screen.getByText('Iniciar'));
    await fireEvent.press(screen.getByText('Detener'));
    await waitFor(() => expect(fake.state.recording).toBe(false));
    expect(fake.state.stops).toBe(1);
  });

  it('keeps a video ended before Guardar and names it after the time when saved', async () => {
    const { buttons, fake, onClose, cameraOn } = await setup({ video: { stopAfterSeconds: 10 } });
    await cameraOn();
    await fireEvent.press(screen.getByText('Grabar'));
    await fireEvent.press(screen.getByText('Iniciar'));
    await fireEvent.press(screen.getByText('Parar video'));
    buttons.advance(ms(20_000));
    await fireEvent.press(screen.getByText('Detener'));
    expect(fake.state.kept).toEqual([]);
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('saved'));
    expect(fake.state.kept).toEqual([{ uri: 'file:///cache/recording-1.mp4', name: 'Swimcro_time-1' }]);
  });

  it('does not keep a video recorded without starting the clock, and lets the person record again', async () => {
    const { fake, onClose, cameraOn } = await setup();
    await cameraOn();
    await fireEvent.press(screen.getByText('Grabar'));
    await fireEvent.press(screen.getByText('Parar video'));
    await waitFor(() => expect(fake.state.discarded).toEqual(['file:///cache/recording-1.mp4']));
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Grabar'));
    expect(fake.state.recordings).toBe(2);
  });

  it('keeps the video without a time when the time is discarded', async () => {
    const { fake, saved, onClose, cameraOn } = await setup({ video: { stopAfterSeconds: 10 } });
    await cameraOn();
    await fireEvent.press(screen.getByText('Grabar'));
    await fireEvent.press(screen.getByText('Iniciar'));
    await fireEvent.press(screen.getByText('Detener'));
    await fireEvent.press(screen.getByText('Descartar'));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('discarded'));
    expect(saved).toHaveLength(0);
    expect(fake.state.kept).toHaveLength(1);
    expect(fake.state.kept[0]!.name).toMatch(/^Swimcro_\d{4}-\d{2}-\d{2}T/);
  });

  it('saves the time and closes with a video notice when the gallery refuses the video', async () => {
    const { buttons, fake, saved, onClose, cameraOn } = await setup({ video: { stopAfterSeconds: 10 }, failKeep: true });
    await cameraOn();
    await fireEvent.press(screen.getByText('Grabar'));
    await fireEvent.press(screen.getByText('Iniciar'));
    buttons.advance(ms(20_000));
    await fireEvent.press(screen.getByText('Detener'));
    await fireEvent.press(screen.getByText('Parar video'));
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('saved_no_video'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(1);
    expect(fake.state.keepAttempts).toBe(1);
  });

  it('closes with the same notice when the video ends after Guardar and the gallery refuses it', async () => {
    const { buttons, saved, onClose, cameraOn } = await setup({ video: { stopAfterSeconds: 10 }, failKeep: true });
    await cameraOn();
    await fireEvent.press(screen.getByText('Grabar'));
    await fireEvent.press(screen.getByText('Iniciar'));
    buttons.advance(ms(20_000));
    await fireEvent.press(screen.getByText('Detener'));
    await fireEvent.press(screen.getByText('Guardar'));
    await fireEvent.press(await screen.findByText('Parar video'));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('saved_no_video'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(1);
  });

  it('says the video was lost, not saved, when the discarded time keeps no video', async () => {
    const { saved, onClose, cameraOn } = await setup({ video: { stopAfterSeconds: 10 }, failKeep: true });
    await cameraOn();
    await fireEvent.press(screen.getByText('Grabar'));
    await fireEvent.press(screen.getByText('Iniciar'));
    await fireEvent.press(screen.getByText('Detener'));
    await fireEvent.press(screen.getByText('Descartar'));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('discarded_no_video'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(0);
  });

  it('starts recording and the clock with one press when Ajustes says so', async () => {
    const { fake, cameraOn } = await setup({ video: { startWithTime: true } });
    await cameraOn();
    await fireEvent.press(screen.getByText('Iniciar y grabar'));
    expect(fake.state.recording).toBe(true);
    expect(screen.getByText('Detener')).toBeTruthy();
  });

  it('ignores the start key until the video records', async () => {
    const { buttons, fake, cameraOn } = await setup();
    await cameraOn();
    await act(async () => void buttons.press(24));
    expect(screen.queryByText('Detener')).toBeNull();
    await fireEvent.press(screen.getByText('Grabar'));
    buttons.advance(ms(1000));
    await act(async () => void buttons.press(24));
    expect(screen.getByText('Detener')).toBeTruthy();
    expect(fake.state.recordings).toBe(1);
  });

  describe('the explanation before the permissions (#1173)', () => {
    const asked = () => ({ store: createInMemoryFamilyTimingNoticeStore(), userId: 'user-1' });

    it('explains what is recorded and where it stays before the system asks, and asks once the person continues', async () => {
      const intro = asked();
      const { fake, cameraOn } = await setup({ intro });
      expect(await screen.findByText('Antes de grabar')).toBeTruthy();
      expect(screen.getByText(/queda solo en tu teléfono, en el álbum «Swimcro»/)).toBeTruthy();
      expect(screen.getByText(/solo cuando una grabación está en curso/)).toBeTruthy();
      expect(fake.state.audioAsked).toEqual([]);
      expect(fake.state.ready).toBeNull();

      await fireEvent.press(screen.getByText('Continuar'));
      await cameraOn();
      expect(fake.state.audioAsked).toEqual([true]);
      expect(screen.queryByText('Antes de grabar')).toBeNull();
      expect(intro.store.seenBy.has('user-1')).toBe(true);
    });

    it('does not explain again once it was seen, and asks for the permissions at once', async () => {
      const intro = { store: createInMemoryFamilyTimingNoticeStore(['user-1']), userId: 'user-1' };
      const { fake, cameraOn } = await setup({ intro });
      await cameraOn();
      expect(screen.queryByText('Antes de grabar')).toBeNull();
      expect(fake.state.audioAsked).toEqual([true]);
    });

    it('leaves without asking for anything, and shows the explanation again next time, when the person goes back', async () => {
      const intro = asked();
      const { fake, onClose } = await setup({ intro });
      await fireEvent.press(await screen.findByLabelText('Volver'));
      expect(onClose).toHaveBeenCalledWith('discarded');
      expect(fake.state.audioAsked).toEqual([]);
      expect(intro.store.seenBy.size).toBe(0);
    });

    it('still asks for the permissions when the store cannot be read', async () => {
      const store = { ...createInMemoryFamilyTimingNoticeStore(), seen: () => Promise.reject(new Error('no store')) };
      const { fake, cameraOn } = await setup({ intro: { store, userId: 'user-1' } });
      await cameraOn();
      expect(fake.state.audioAsked).toEqual([true]);
    });
  });

  it('closes when the permissions are refused, and asks for the microphone only with sound', async () => {
    const { fake, onClose } = await setup({ granted: false, video: { audio: false } });
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('denied'));
    expect(fake.state.audioAsked).toEqual([false]);
  });

  it('closes with a camera error when the camera fails to open, and leaves nothing recording', async () => {
    const { fake, onClose } = await setup({ failToOpen: true });
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('camera_error'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fake.state.recordings).toBe(0);
  });

  it('closes with a camera error when the failure arrives after the screen opened', async () => {
    const { fake, onClose } = await setup();
    await waitFor(() => expect(fake.state.ready).not.toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => fake.state.fail());
    expect(onClose).toHaveBeenCalledWith('camera_error');
  });

  describe('when the camera never answers', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    async function openScreen() {
      const ctx = await setup();
      await act(async () => void jest.advanceTimersByTime(1));
      return ctx;
    }

    it('gives up after the open timeout', async () => {
      const { onClose } = await openScreen();
      await act(async () => void jest.advanceTimersByTime(CAMERA_OPEN_TIMEOUT_MS - 1));
      expect(onClose).not.toHaveBeenCalled();
      await act(async () => void jest.advanceTimersByTime(1));
      expect(onClose).toHaveBeenCalledWith('camera_error');
    });

    it('does not give up once the camera is on', async () => {
      const { fake, onClose } = await openScreen();
      await act(async () => fake.state.ready?.());
      await act(async () => void jest.advanceTimersByTime(CAMERA_OPEN_TIMEOUT_MS * 2));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it('warns when the phone has little free space', async () => {
    await setup({ freeBytes: LOW_SPACE_BYTES - 1 });
    expect(await screen.findByText('Queda poco espacio en el teléfono: el video puede cortarse.')).toBeTruthy();
  });

  it('cancels the time and deletes the video when the app leaves the screen while recording', async () => {
    let onChange: ((state: AppStateStatus) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      onChange = handler as (state: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const { fake, saved, onClose, cameraOn } = await setup();
    await cameraOn();
    await fireEvent.press(screen.getByText('Grabar'));
    await fireEvent.press(screen.getByText('Iniciar'));
    await act(async () => onChange?.('background'));

    expect(onClose).toHaveBeenCalledWith('cancelled');
    await waitFor(() => expect(fake.state.discarded).toEqual(['file:///cache/recording-1.mp4']));
    expect(fake.state.kept).toEqual([]);
    expect(saved).toHaveLength(0);
    spy.mockRestore();
  });
});

// Issue #1090: "No molestar" while recording, when Ajustes says so.
describe('VideoStopwatchContainer and No molestar', () => {
  it('turns it on when the video starts and puts the phone back when the video ends', async () => {
    const { fake, cameraOn, dnd } = await setup({ video: { doNotDisturb: true, stopAfterSeconds: 0 } });
    await cameraOn();
    expect(dnd.on).toBe(false);
    await fireEvent.press(screen.getByText('Grabar'));
    expect(dnd.on).toBe(true);
    await fireEvent.press(screen.getByText('Iniciar'));
    await fireEvent.press(screen.getByText('Detener'));
    await waitFor(() => expect(fake.state.recording).toBe(false));
    await waitFor(() => expect(dnd.on).toBe(false));
    expect(dnd.restored).toBe(1);
  });

  it('leaves it alone when Ajustes says No', async () => {
    const { cameraOn, dnd } = await setup();
    await cameraOn();
    await fireEvent.press(screen.getByText('Grabar'));
    expect(dnd.turnedOn).toBe(0);
    expect(screen.getByText('Iniciar')).toBeTruthy();
  });

  it('records as before without the access', async () => {
    const { fake, cameraOn, dnd } = await setup({ video: { doNotDisturb: true }, dnd: createFakeDoNotDisturb(false) });
    await cameraOn();
    await fireEvent.press(screen.getByText('Grabar'));
    expect(fake.state.recording).toBe(true);
    expect(dnd.on).toBe(false);
    expect(screen.getByText('Iniciar')).toBeTruthy();
  });

  it('puts the phone back when the screen closes while recording', async () => {
    const { cameraOn, dnd } = await setup({ video: { doNotDisturb: true } });
    await cameraOn();
    await fireEvent.press(screen.getByText('Grabar'));
    expect(dnd.on).toBe(true);
    await act(async () => screen.unmount());
    expect(dnd.on).toBe(false);
  });
});

describe('videoName', () => {
  it('carries the time id, or the moment for a video without a time', () => {
    expect(videoName('abc')).toBe('Swimcro_abc');
    expect(videoName(null, new Date('2026-11-16T12:34:56.789Z'))).toBe('Swimcro_2026-11-16T12-34-56-789Z');
  });
});

describe('VideoStopwatchContainer stopwatch strip', () => {
  it('hands the camera the marks to draw, or nothing when Ajustes turns it off', async () => {
    const { buttons, fake, cameraOn } = await setup({ laps: 2 });
    await cameraOn();
    expect(fake.state.overlay).toMatchObject({ enabled: true, event: 'Libre 50 m · Piscina de 25 m', startedAt: null, thousandths: true });
    await fireEvent.press(screen.getByText('Grabar'));
    await fireEvent.press(screen.getByText('Iniciar'));
    buttons.advance(ms(15_000));
    await fireEvent.press(screen.getByText('Parcial'));
    expect(fake.state.overlay).toMatchObject({ startedAt: ms(1000), splits: [ms(16_000)], stoppedAt: null });
  });

  it('turns the strip off when Ajustes says so', async () => {
    const { fake, cameraOn } = await setup({ video: { showStopwatch: false } });
    await cameraOn();
    expect(fake.state.overlay?.enabled).toBe(false);
  });
});
