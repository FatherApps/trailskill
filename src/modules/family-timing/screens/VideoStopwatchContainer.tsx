import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';

import { t } from '../../../core/i18n';
import { usePreferences } from '../../../core/preferences';
import { formatMillis, millisFromNanos } from '../../../core/time';
import { buttonAction, nanosFromSeconds, timingButton, useTimingButtons, type TimingButtonPort } from '../../timing';
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

/** How the screen closed: the time saved, the time discarded, the permissions refused, or the take cancelled by leaving the app. */
export type VideoStopwatchResult = 'saved' | 'discarded' | 'denied' | 'cancelled';

export type VideoStopwatchContainerProps = {
  /** "Libre 50 m · Piscina de 25 m". */
  event: string;
  laps: number;
  now?: () => bigint;
  buttons?: TimingButtonPort;
  camera: VideoCamera;
  /** Saves the stopped time in Mis tiempos as the stopwatch without video does, and returns its id. */
  saveTime: (stopwatch: FamilyStopwatch) => Promise<string>;
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
  measurementId ? `TrailSkill_${measurementId}` : `TrailSkill_${at.toISOString().replace(/[:.]/g, '-')}`;

// The individual stopwatch with the rear camera (#1088). The stopwatch works as without video, on the same clock and
// keys; recording only starts and stops with its own button, or a few seconds after the clock stops (Ajustes).
export function VideoStopwatchContainer(props: VideoStopwatchContainerProps) {
  const { event, laps, camera, saveTime, onClose, buttonsHint } = props;
  const buttons = props.buttons ?? timingButton;
  const now = props.now ?? buttons.now;
  const { preferences } = usePreferences();
  const video = preferences.videoRecording;
  const buttonPrefs = preferences.timingButtons;
  const precision = preferences.timePrecision;

  const [phase, setPhase] = useState<'asking' | 'ready'>('asking');
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

  useEffect(() => {
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
    // Asked once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function keepVideo(uri: string, measurementId: string | null) {
    try {
      await camera.keep(uri, videoName(measurementId));
    } catch {
      // The time is already saved; a video the gallery refused is lost, not the time.
    }
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
      await keepVideo(uri, o.savedId);
      return close('saved');
    }
    // A video without a started clock is not kept (decision 9); the person may record again.
    if (!o.clockStarted) {
      camera.discard(uri);
      if (o.leaving) close('discarded');
      return;
    }
    // A discarded time keeps its video in the gallery, without a time (decision 8).
    if (o.discarded) {
      await keepVideo(uri, null);
      return close('discarded');
    }
    setPending(uri);
  }

  function startRecording() {
    const camera = preview.current;
    if (!camera || recording.current || !cameraReady || closed.current) return false;
    recording.current = true;
    setRecordingSince(now());
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
        await keepVideo(uri, id);
        close('saved');
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
      await keepVideo(uri, null);
      return close('discarded');
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
            style={StyleSheet.absoluteFill}
          />
        ) : null
      }
      onBack={back}
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
