import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';

import { t } from '../../../core/i18n';
import { usePreferences } from '../../../core/preferences';
import { formatMillis, millisFromNanos } from '../../../core/time';
import { buttonAction, nanosFromSeconds, timingButton, useTimingButtons, type TimingButtonPort } from '../../timing';
import type { FamilyTimingNoticeStore } from '../data/noticeSeen';
import type { CameraPreviewHandle, VideoCamera } from '../data/videoCamera';
import {
  elapsedMillisAt,
  finalMillis,
  idleFamilyStopwatch,
  splitAt,
  splitMillis,
  startAt,
  stopAt,
  type FamilyStopwatch,
} from '../domain/familyStopwatch';
import { VideoStopwatchScreen } from './VideoStopwatchScreen';
import '../i18n';

const KEEP_AWAKE_TAG = 'family-timing-video';
// Below this free space a warning shows before recording: about 8 minutes of 1080p.
export const LOW_SPACE_BYTES = 500 * 1024 * 1024;
// CameraX opens in about a second; past this the camera is stuck (the native error never arrived) and the person goes back to the plain stopwatch.
export const CAMERA_OPEN_TIMEOUT_MS = 10_000;

/**
 * How the screen closed: the time saved, the time discarded, the permissions refused, the take cancelled by leaving the app, or the camera that did not open.
 * `saved_no_video` and `discarded_no_video` are the first two when the gallery refused the video (#1172).
 */
export type VideoStopwatchResult = 'saved' | 'saved_no_video' | 'discarded' | 'discarded_no_video' | 'denied' | 'cancelled' | 'camera_error';

export type VideoStopwatchContainerProps = {
  /** "Libre 50 m · Piscina de 25 m". */
  event: string;
  laps: number;
  now?: () => bigint;
  buttons?: TimingButtonPort;
  camera: VideoCamera;
  /** Remembers that the explanation before the permissions was seen, so it shows the first time only. Without it the screen asks for the permissions at once. */
  intro?: { store: FamilyTimingNoticeStore; userId: string };
  /** Saves the stopped time in Mis tiempos as the stopwatch without video does, and returns its id. */
  saveTime: (stopwatch: FamilyStopwatch) => Promise<string>;
  /** Links a saved time to its video in the gallery, with where in the video the clock started (#1089). */
  linkVideo?: (measurementId: string, assetId: string, startOffsetMillis: number) => Promise<void>;
  /** The keys line under the time, given the connected headset's name. */
  buttonsHint: (keyboard: string | undefined) => string;
  onClose: (result: VideoStopwatchResult) => void;
};

const pad = (n: number) => String(n).padStart(2, '0');
const recordingClock = (millis: number) => {
  const seconds = Math.floor(millis / 1000);
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
};

/** The video's name in the gallery: the time's id, so a phone that later gets the time can find its video (decision 19). */
export const videoName = (measurementId: string | null, at: Date = new Date()) =>
  measurementId ? `Swimcro_${measurementId}` : `Swimcro_${at.toISOString().replace(/[:.]/g, '-')}`;

// The individual stopwatch with the rear camera (#1088). The stopwatch works as without video, on the same clock and
// keys; recording only starts and stops with its own button, or a few seconds after the clock stops (Ajustes).
export function VideoStopwatchContainer(props: VideoStopwatchContainerProps) {
  const { event, laps, camera, intro, saveTime, linkVideo, onClose, buttonsHint } = props;
  const buttons = props.buttons ?? timingButton;
  const now = props.now ?? buttons.now;
  const { preferences } = usePreferences();
  const video = preferences.videoRecording;
  const buttonPrefs = preferences.timingButtons;
  const precision = preferences.timePrecision;

  const [phase, setPhase] = useState<'checking' | 'intro' | 'asking' | 'ready'>(intro ? 'checking' : 'asking');
  const [lowSpace, setLowSpace] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [recordingSince, setRecordingSince] = useState<bigint | null>(null);
  const [stopwatch, setStopwatch] = useState<FamilyStopwatch>(idleFamilyStopwatch);
  const [savingVideo, setSavingVideo] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [, setTick] = useState(0);

  const preview = useRef<CameraPreviewHandle>(null);
  const latest = useRef(stopwatch);
  const recording = useRef(false);
  // When the last recording started, on the clock of the buttons: the start of the clock is this far into the video.
  const recordStart = useRef<bigint | null>(null);
  // What happens to the video when its recording ends.
  const outcome = useRef<{ savedId: string | null; discarded: boolean; cancelled: boolean; leaving: boolean; clockStarted: boolean }>({
    savedId: null,
    discarded: false,
    cancelled: false,
    leaving: false,
    clockStarted: false,
  });
  // A recording that ended while its time still waits for Guardar or Descartar.
  const pending = useRef<string | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const setPending = (uri: string | null) => {
    pending.current = uri;
    setHasPending(uri !== null);
  };
  const closed = useRef(false);
  const saving = useRef(false);

  const close = (result: VideoStopwatchResult) => {
    if (closed.current) return;
    closed.current = true;
    onClose(result);
  };

  // The camera failed to open: the screen goes back to the stopwatch without video. Unmounting stops anything recording.
  const cameraFailed = () => {
    outcome.current.cancelled = true;
    close('camera_error');
  };

  // The first time, the person is told what the camera and the microphone are for before the system asks (#1173). A store that cannot be read skips it.
  useEffect(() => {
    if (!intro) return;
    let active = true;
    intro.store
      .seen(intro.userId)
      .catch(() => true)
      .then((seen) => active && setPhase(seen ? 'asking' : 'intro'));
    return () => {
      active = false;
    };
    // Read once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const continueFromIntro = () => {
    intro?.store.markSeen(intro.userId).catch(() => undefined);
    setPhase('asking');
  };

  useEffect(() => {
    if (phase !== 'asking') return;
    let active = true;
    camera
      .requestPermissions(video.audio)
      .then((granted) => {
        if (!active) return;
        if (!granted) return close('denied');
        const free = camera.freeBytes();
        setLowSpace(free !== null && free < LOW_SPACE_BYTES);
        setPhase('ready');
      })
      .catch(() => active && close('denied'));
    return () => {
      active = false;
    };
    // Asked once, when the screen gets to this phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // A camera that never says ready nor fails does not leave the person stuck.
  useEffect(() => {
    if (phase !== 'ready' || cameraReady) return;
    const timer = setTimeout(cameraFailed, CAMERA_OPEN_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cameraReady]);

  // The screen stays awake the whole time the camera is open, and the clocks refresh while something runs.
  useEffect(() => {
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, []);
  const ticking = stopwatch.status === 'running' || recordingSince !== null;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setTick((n) => n + 1), 47);
    return () => clearInterval(timer);
  }, [ticking]);

  // The time is already saved (or discarded on purpose); a video the gallery refused is lost, not the time, and the person is told when the screen closes.
  async function keepVideo(uri: string, measurementId: string | null) {
    let assetId: string;
    try {
      assetId = await camera.keep(uri, videoName(measurementId));
    } catch {
      return false;
    }
    const sw = latest.current;
    if (!measurementId || !linkVideo || sw.status === 'idle' || recordStart.current === null) return true;
    try {
      await linkVideo(measurementId, assetId, Math.max(0, millisFromNanos(sw.startedAt - recordStart.current)));
    } catch {
      // Without the link the video is still in the gallery; only the button in Mis tiempos is missing.
    }
    return true;
  }

  async function finished(uri: string | null) {
    recording.current = false;
    setRecordingSince(null);
    const o = outcome.current;
    if (!uri) {
      if (o.savedId) close('saved');
      else if (o.discarded || o.leaving) close('discarded');
      return;
    }
    if (o.cancelled) return camera.discard(uri);
    if (o.savedId) {
      return close((await keepVideo(uri, o.savedId)) ? 'saved' : 'saved_no_video');
    }
    // A video without a started clock is not kept (decision 9); the person may record again.
    if (!o.clockStarted) {
      camera.discard(uri);
      if (o.leaving) close('discarded');
      return;
    }
    // A discarded time keeps its video in the gallery, without a time (decision 8).
    if (o.discarded) {
      return close((await keepVideo(uri, null)) ? 'discarded' : 'discarded_no_video');
    }
    setPending(uri);
  }

  function startRecording() {
    const camera = preview.current;
    if (!camera || recording.current || !cameraReady || closed.current) return false;
    recording.current = true;
    const at = now();
    recordStart.current = at;
    setRecordingSince(at);
    camera.record().then(finished, () => finished(null));
    return true;
  }

  const stopRecording = () => {
    if (recording.current) preview.current?.stop();
  };

  // Iniciar works once the video records; with "mismo botón" in Ajustes it also starts the recording.
  const canStart = () => recording.current || (video.startWithTime && cameraReady && phase === 'ready' && pending.current === null);

  const apply = (next: FamilyStopwatch) => {
    latest.current = next;
    setStopwatch(next);
  };
  function start(at: bigint) {
    if (latest.current.status !== 'idle' || !canStart()) return;
    if (!recording.current && !startRecording()) return;
    outcome.current.clockStarted = true;
    apply(startAt(latest.current, at));
  }

  const keys = useTimingButtons({
    enabled: buttonPrefs.enabled && phase === 'ready',
    config: { startKey: buttonPrefs.startKey, splitKey: buttonPrefs.splitKey, lockoutNanos: nanosFromSeconds(buttonPrefs.lockoutSeconds) },
    target: () => {
      const sw = latest.current;
      return sw.status === 'running' ? { status: 'running', startedAt: sw.startedAt } : { status: sw.status };
    },
    // A start before the video records does nothing, and does not vibrate.
    decide: (press, config, target) => {
      const action = buttonAction(press, config, target);
      return action === 'start' && !canStart() ? null : action;
    },
    vibrate: buttonPrefs.vibrate,
    port: buttons,
    onAction: (action, at) => {
      if (action === 'start') return start(at);
      apply(action === 'split' ? splitAt(latest.current, at, laps) : stopAt(latest.current, at));
    },
  });

  // The clock stopped: the video goes on for the seconds chosen in Ajustes, then stops by itself.
  const stopped = stopwatch.status === 'stopped';
  const isRecording = recordingSince !== null;
  useEffect(() => {
    if (!stopped || !isRecording) return;
    const timer = setTimeout(stopRecording, video.stopAfterSeconds * 1000);
    return () => clearTimeout(timer);
  }, [stopped, isRecording, video.stopAfterSeconds]);

  // Leaving the app (answering a call, for instance) takes the camera away: the take is cancelled and its video deleted.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background' || !recording.current) return;
      outcome.current.cancelled = true;
      stopRecording();
      close('cancelled');
    });
    return () => subscription?.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closing the screen any other way never leaves the camera recording.
  useEffect(
    () => () => {
      if (recording.current) preview.current?.stop();
    },
    [],
  );

  async function save() {
    if (saving.current || latest.current.status !== 'stopped' || finalMillis(latest.current) === null) return;
    saving.current = true;
    setSaveError(false);
    try {
      const id = await saveTime(latest.current);
      outcome.current.savedId = id;
      const uri = pending.current;
      setPending(null);
      if (uri) {
        close((await keepVideo(uri, id)) ? 'saved' : 'saved_no_video');
      } else if (recording.current) setSavingVideo(true);
      else close('saved');
    } catch {
      setSaveError(true);
    } finally {
      saving.current = false;
    }
  }

  async function discard() {
    outcome.current.discarded = true;
    const uri = pending.current;
    setPending(null);
    if (uri) {
      return close((await keepVideo(uri, null)) ? 'discarded' : 'discarded_no_video');
    }
    if (recording.current) return stopRecording();
    close('discarded');
  }

  function back() {
    if (outcome.current.savedId) return;
    if (latest.current.status === 'idle') {
      outcome.current.leaving = true;
      if (recording.current) return stopRecording();
      return close('discarded');
    }
    void discard();
  }

  const elapsed = elapsedMillisAt(stopwatch, now());
  const splits = splitMillis(stopwatch);
  const final = finalMillis(stopwatch);
  const ends = stopwatch.status === 'stopped' && splits.length > 0 && final !== null ? [...splits, final] : splits;
  const formatLap = (millis: number | null) => formatMillis(millis, { precision, alwaysShowMinutes: true });

  return (
    <VideoStopwatchScreen
      view={{
        event,
        phase,
        status: stopwatch.status,
        time: formatMillis(stopwatch.status === 'idle' ? 0 : elapsed, { precision }),
        recording: isRecording,
        recordingTime: recordingSince !== null ? recordingClock(millisFromNanos(now() - recordingSince)) : null,
        cameraReady,
        canStart: isRecording || (video.startWithTime && cameraReady && !hasPending),
        startWithTime: video.startWithTime,
        hasLaps: laps > 1,
        lapProgress:
          laps > 1 && stopwatch.status === 'running' ? t('family_timing.stopwatch.lap_progress', { current: stopwatch.splitMarks.length + 1, total: laps }) : null,
        laps: laps > 1 ? ends.map((total, index) => ({ lap: formatLap(total - (index === 0 ? 0 : ends[index - 1]!)), total: formatLap(total) })) : [],
        noTime: stopwatch.status === 'stopped' && final === null,
        lowSpace,
        savingVideo,
        saveError,
        buttonsHint: keys.active ? buttonsHint(keys.keyboards[0]?.name) : null,
      }}
      preview={
        phase === 'ready' ? (
          <camera.Preview
            ref={preview}
            quality={video.quality}
            audio={video.audio}
            overlay={{
              enabled: video.showStopwatch,
              event,
              startedAt: stopwatch.status === 'idle' ? null : stopwatch.startedAt,
              stoppedAt: stopwatch.status === 'stopped' ? stopwatch.stoppedAt : null,
              splits: stopwatch.status === 'idle' ? [] : stopwatch.splitMarks,
              thousandths: precision === 'thousandths',
            }}
            onReady={() => setCameraReady(true)}
            onError={cameraFailed}
            style={StyleSheet.absoluteFill}
          />
        ) : null
      }
      onBack={back}
      onContinue={continueFromIntro}
      onRecord={() => {
        if (!hasPending) startRecording();
      }}
      onStopRecording={stopRecording}
      onStart={() => start(now())}
      onSplit={() => apply(splitAt(latest.current, now(), laps))}
      onStop={() => apply(stopAt(latest.current, now()))}
      onSave={save}
      onDiscard={discard}
    />
  );
}
