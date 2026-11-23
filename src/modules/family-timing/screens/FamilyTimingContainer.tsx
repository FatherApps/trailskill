import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '../../../core/i18n';
import { usePreferences } from '../../../core/preferences';
import { distances, pools, strokes, type DistanceCode, type PoolCode, type StrokeCode } from '../../../core/sport';
import { useRecordSyncStates } from '../../../core/sync';
import { formatMillis, formatTime } from '../../../core/time';
import type { AthleteAvatarSlot, ChipRowOption } from '../../../core/ui';
import { athleteDisplay, formatDate, type SchoolAthlete } from '../../athletes';
import {
  buttonAction,
  defaultSplitMeters,
  keyName,
  nanosFromSeconds,
  SplitMetersScreen,
  timingButton,
  useTimingButtons,
  type ButtonAction,
  type ButtonConfig,
  type ButtonPress,
  type ButtonTarget,
  type PaceSummaryProps,
  type TimingButtonPort,
} from '../../timing';
import {
  cleanNote,
  FAMILY_MEASUREMENTS_TABLE,
  type FamilyMeasurement,
  type FamilyMeasurementRepository,
  type FamilySessionType,
} from '../data/familyMeasurements';
import type { QrScanner } from '../data/qrScanner';
import { shareCodeFromQr } from '../domain/scannedCode';
import { FamilyTransferError, type FamilyTransfer, type FamilyTransferErrorCode, type FamilyTransferRepository } from '../data/familyTransfers';
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
import { bestTimeIds } from '../domain/bestTimes';
import {
  arrivalMillis,
  MAX_SWIMMERS,
  MIN_SWIMMERS,
  newFamilySeries,
  pressAt,
  seriesElapsedAt,
  seriesStatus,
  startedAtOf,
  undoLast,
  type FamilySeries,
} from '../domain/familySeries';
import { lapMeters, lapsFor } from '../domain/laps';
import { localDay } from '../domain/localDay';
import { officialMatches, officialResultKeyOf, type OfficialImport, type OfficialMatch } from '../domain/officialValue';
import { parseTimeEntry } from '../domain/timeEntry';
import { setFamilyTimingAtList } from './familyTimingAtList';
import {
  FamilyTimingScreen,
  type FamilyCard,
  type FamilyDeletedCard,
  type FamilyDetailView,
  type FamilyFilterKey,
  type FamilyFiltersView,
  type FamilyTimingView,
} from './FamilyTimingScreen';
import type { FamilyTimingNoticeStore } from '../data/noticeSeen';
import type { FamilyVideoRepository } from '../data/familyVideos';
import type { VideoCamera } from '../data/videoCamera';
import type { VideoLibrary, VideoPlayerHandle } from '../data/videoLibrary';
import { videoMatchesTime, type PickedVideo, type VideoSharing } from '../data/videoSharing';
import { VideoPlayerScreen } from './VideoPlayerScreen';
import { VideoStopwatchContainer, videoName, type VideoStopwatchResult } from './VideoStopwatchContainer';
import '../i18n';

const KEEP_AWAKE_TAG = 'family-timing';
const WEEK_MS = 7 * 86_400_000;

export type FamilyTimingContainerProps = {
  // Injected by the route (this module cannot read show_photo or the photo): the athletes' avatar with their photo. Absent: the initials.
  Avatar?: AthleteAvatarSlot;
  userId: string;
  athletes: SchoolAthlete[];
  repository: FamilyMeasurementRepository;
  onBack: () => void;
  // The athlete's imported official results (results-import); a matching one becomes the official value of a competition time.
  imports?: { listByAthlete(athleteId: string): Promise<OfficialImport[]> };
  // Organization names by provider, from data; without one the official tag is generic.
  sourceNames?: Record<string, string>;
  // The headset or volume keys (Ajustes, "Botones para cronometrar"); injected by tests.
  buttons?: TimingButtonPort;
  // Injected by tests; otherwise the buttons' clock, so a touch and a key press share one time base.
  now?: () => bigint;
  // Sending a time to another swimmer's family (#973); without it the option is not offered.
  transfers?: FamilyTransferRepository;
  // The share-code lookup of the accounts module: the short name of the swimmer with a code, or null.
  shareCodes?: { find(code: string): Promise<string | null> };
  // The codes other families gave this person, kept after an accepted send (accounts module): picked instead of typed again.
  savedCodes?: {
    list(userId: string, options?: { includeExpired?: boolean }): Promise<{ id: string; code: string; athleteShortName: string; expiredAt: string | null }[]>;
    forget(id: string): Promise<void>;
  };
  // Changes when the device synced: requests and moved times arrive by sync, so the lists read again.
  syncKey?: number;
  // Remembers that the notice was seen, so it shows on the first visit only. Without it the notice always shows.
  notice?: FamilyTimingNoticeStore;
  // Remembers that the explanation before the camera permissions was seen (#1173), so it shows the first time only. Without it there is no explanation.
  videoIntro?: FamilyTimingNoticeStore;
  // The camera for reading a swimmer's code QR in the send step (issue 1322); without it «Escanear QR» is not offered.
  qrScanner?: QrScanner | null;
  // Remembers that the explanation before the scanner's camera permission was seen, so it shows the first time only. Without it there is no explanation.
  scanIntro?: FamilyTimingNoticeStore;
  // The rear camera and the gallery for the stopwatch with video (#1088); without it «Grabar» is not offered.
  videoCamera?: VideoCamera | null;
  // Which time each video belongs to, on this phone only (#1089); without it no video is linked nor offered.
  videos?: FamilyVideoRepository;
  // The videos already in the gallery and their player (#1089); without it «Ver video» is not offered.
  videoLibrary?: VideoLibrary | null;
  // Sharing a time's video and linking one received from another family (#1201); without it neither is offered.
  videoSharing?: VideoSharing | null;
};

// What the last video action left to say (#1201), shown on the view it ended on.
type VideoNoticeKind = 'linked' | 'linked_original_kept' | 'link_failed' | 'share_failed';
const VIDEO_NOTICE_VARIANT: Record<VideoNoticeKind, 'success' | 'warn'> = {
  linked: 'success',
  linked_original_kept: 'success',
  link_failed: 'warn',
  share_failed: 'warn',
};

// «Ir a la salida» lands this long before the clock started, so the start itself is seen.
export const JUMP_LEAD_MILLIS = 2_000;

const targetOf = (sw: FamilyStopwatch): ButtonTarget => (sw.status === 'running' ? { status: 'running', startedAt: sw.startedAt } : { status: sw.status });

const seriesTargetOf = (fs: FamilySeries): ButtonTarget => {
  const status = seriesStatus(fs);
  const startedAt = startedAtOf(fs);
  if (status === 'running' && startedAt !== null) return { status: 'running', startedAt };
  return { status: status === 'idle' ? 'idle' : 'stopped' };
};

// In a series only the start/stop key acts: it gives the start, then closes the next swimmer. The lap key does nothing (decision 8).
const seriesDecide = (press: ButtonPress, config: ButtonConfig, target: ButtonTarget): ButtonAction | null => {
  if (press.keyCode !== config.startKey) return null;
  const action = buttonAction(press, config, target);
  return action === 'start' ? 'start' : action === 'stop' ? 'arrival' : null;
};

export type FamilyTimingMode = 'individual' | 'series';

// The pool starts unchosen: the laps depend on it, so the stopwatch waits until the person picks one.
type Setup = {
  mode: FamilyTimingMode;
  swimmers: number;
  stroke: StrokeCode;
  distance: DistanceCode;
  pool: PoolCode | null;
  sessionType: FamilySessionType;
  competition: string;
  // Individual mode: who the time goes to, a swimmer by default, or null for "Sin asignar" (someone else's child), with a note.
  athleteId: string | null;
  note: string;
};
const initialSetup: Setup = {
  mode: 'individual',
  swimmers: MIN_SWIMMERS,
  stroke: strokes[0].code,
  distance: distances[1].code,
  pool: null,
  sessionType: 'training',
  competition: '',
  athleteId: null,
  note: '',
};

// A lane of a series once timed: who swam it (null: not given to a swimmer yet) and the stroke.
type Lane = { athleteId: string | null; stroke: StrokeCode };

// The chip of the times not given to a swimmer yet. Ids are UUIDs, so it never matches an athlete.
const UNASSIGNED = 'unassigned';
const swimmerCounts = Array.from({ length: MAX_SWIMMERS - MIN_SWIMMERS + 1 }, (_, i) => String(MIN_SWIMMERS + i));

type Step =
  | { kind: 'list' }
  | { kind: 'setup' }
  | { kind: 'stopwatch'; saveError: boolean; videoNotice?: Exclude<VideoStopwatchResult, 'saved' | 'discarded'> }
  | { kind: 'video' }
  // Free laps, once stopped: the optional review of the meters of the marks.
  | { kind: 'meters' }
  | { kind: 'series' }
  | { kind: 'series_assign'; lanes: Lane[]; saveError: boolean }
  | { kind: 'official'; id: string; text: string; invalid: boolean }
  // Picking which imported official result goes with a competition time (#974).
  | { kind: 'choose_official'; id: string; saveError: boolean }
  | { kind: 'edit'; id: string; stroke: StrokeCode; athleteId: string | null; distance: DistanceCode; note: string; confirmingDelete: boolean; saveError: boolean }
  | { kind: 'deleted'; restoreError: boolean }
  // One saved time with everything known about it (#1002).
  | { kind: 'detail'; id: string }
  // The video of a saved time (#1089); back goes to where it was opened.
  | { kind: 'time_video'; id: string; from: 'list' | 'detail' }
  // Sending a time with the other swimmer's code: `found` is the short name once the code was looked up.
  | {
      kind: 'send';
      id: string;
      code: string;
      found: string | null;
      error: FamilyTransferErrorCode | null;
      busy: boolean;
      savedId?: string | null;
      // The kept code that turned out expired (its family changed it): explained here once, while its entry is removed (#1321).
      expired?: string | null;
      // Reading the code from a QR (issue 1322): the explanation, the permission, the camera; and what the last scan left to say.
      scan?: 'intro' | 'asking' | 'scanning' | null;
      scanNotice?: 'invalid' | 'denied' | 'error' | null;
    }
  // After sending a time with its video, or accepting one, the offer to share or link the video (#1201).
  | { kind: 'video_offer'; offer: 'share' | 'link'; id: string; name: string | null }
  // The chosen video's name does not say it is this time's: of another time (it cannot be linked), or without the time's id.
  | { kind: 'link_check'; id: string; picked: PickedVideo; result: 'other' | 'unknown' };

// A deleted time is removed from the server this long after it was deleted.
const KEEP_DELETED_DAYS = 30;

type Filters = Record<FamilyFilterKey, string>;
const noFilters: Filters = { sessionType: '', stroke: '', distance: '', pool: '' };

/**
 * The lap rows: each finished lap's own time and the total at its end. The last lap ends at the stop, so once stopped it is
 * a row too (null times stay null, never 0).
 */
function lapRows(splits: number[], final: number | null, hasLaps: boolean): { lap: number | null; total: number | null }[] {
  if (!hasLaps) return [];
  const ends: (number | null)[] = splits.length > 0 && final !== null ? [...splits, final] : [...splits];
  return ends.map((total, index) => {
    const previous = index === 0 ? 0 : ends[index - 1];
    return { lap: total !== null && previous !== null ? total - previous : null, total };
  });
}

// `key` is the athlete and reload count it was read for: a read for another key is still loading.
type Loaded =
  | { status: 'loading' }
  | { status: 'error'; key: string }
  | {
      status: 'ready';
      key: string;
      measurements: FamilyMeasurement[];
      // Phone-only times the server rejected (#1025): not in `measurements`, they show beside them marked "No enviado".
      rejected: FamilyMeasurement[];
      deleted: FamilyMeasurement[];
      imported: OfficialImport[];
    };

function seriesButtonsHint(startKey: number, keyboard: string | undefined) {
  const keysLine = t('family_timing.series.buttons', { start: keyName(startKey) });
  return keyboard ? `${t('family_timing.stopwatch.buttons_device', { device: keyboard })} · ${keysLine}` : keysLine;
}

function buttonsHint(startKey: number, splitKey: number, keyboard: string | undefined) {
  const keysLine =
    startKey === splitKey
      ? t('family_timing.stopwatch.buttons_start_only', { start: keyName(startKey) })
      : t('family_timing.stopwatch.buttons', { start: keyName(startKey), split: keyName(splitKey) });
  return keyboard ? `${t('family_timing.stopwatch.buttons_device', { device: keyboard })} · ${keysLine}` : keysLine;
}

// "50 m libre": the title of a card.
const shortEventLabel = (m: { stroke: string; distance: string }) => `${t(`sport.distance.${m.distance}`)} ${t(`sport.stroke.${m.stroke}`).toLowerCase()}`;

const eventLabel = (m: { stroke: string; distance: string; pool: string }) =>
  `${t(`sport.stroke.${m.stroke}`)} ${t(`sport.distance.${m.distance}`)} · ${t(`sport.pool.${m.pool}`)}`;

// A series has one distance and pool; each swimmer's stroke is chosen after the arrivals.
const seriesEventLabel = (m: { distance: string; pool: string }) => `${t(`sport.distance.${m.distance}`)} · ${t(`sport.pool.${m.pool}`)}`;

// Container: reads and writes the guardian's own times (kept on the server for them), and runs the stopwatch.
export function FamilyTimingContainer(props: FamilyTimingContainerProps) {
  const { Avatar, userId, athletes, repository, onBack, imports, sourceNames = {}, buttons = timingButton, transfers, shareCodes, savedCodes, syncKey, notice, videoIntro, videos, scanIntro } =
    props;
  const qrScanner = props.qrScanner ?? null;
  const videoLibrary = props.videoLibrary ?? null;
  const videoSharing = (videos && videoLibrary && props.videoSharing) || null;
  // The video draws the stopwatch from the buttons' clock, so recording needs the native clock too.
  const videoCamera = props.videoCamera && buttons.available ? props.videoCamera : null;
  const now = props.now ?? buttons.now;
  const { preferences } = usePreferences();
  const buttonPrefs = preferences.timingButtons;
  const precision = preferences.timePrecision;
  const freeLaps = preferences.freeLaps;
  const format = useCallback((millis: number | null) => formatMillis(millis, { precision }), [precision]);
  // The lap lines always show minutes ("0:18,40"), as decision 6 of the plan writes them.
  const formatLap = useCallback((millis: number | null) => formatMillis(millis, { precision, alwaysShowMinutes: true }), [precision]);

  const [chosenId, setChosenId] = useState<string | null>(null);
  const [read, setRead] = useState<Loaded>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  // How many times wait for a swimmer ("Sin asignar"); its chip shows only while there are some.
  const [unassignedCount, setUnassignedCount] = useState(0);
  const selectedId =
    chosenId === UNASSIGNED && unassignedCount > 0 ? UNASSIGNED : athletes.some((a) => a.id === chosenId) ? chosenId : (athletes[0]?.id ?? null);
  const key = `${selectedId}:${reload}`;
  const loaded = useMemo<Loaded>(() => (read.status !== 'loading' && read.key === key ? read : { status: 'loading' }), [read, key]);
  const [step, setStep] = useState<Step>({ kind: 'list' });
  // The phone bar shows only on the list: leaving a measurement, an edit or a send from it would lose it.
  useEffect(() => {
    setFamilyTimingAtList(step.kind === 'list');
  }, [step.kind]);
  useEffect(() => () => setFamilyTimingAtList(true), []);
  const [filters, setFilters] = useState<Filters>(noFilters);
  // Unknown until the store answers, so the notice never flashes for someone who already saw it.
  const [showNotice, setShowNotice] = useState(notice === undefined);
  useEffect(() => {
    if (!notice) return;
    let current = true;
    notice
      .seen(userId)
      .then((seen) => {
        if (!current || seen) return;
        // Seen now: it stays for this visit and is gone the next time.
        setShowNotice(true);
        return notice.markSeen(userId);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [notice, userId]);
  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [stopwatch, setStopwatch] = useState<FamilyStopwatch>(idleFamilyStopwatch);
  // The meters the person set in the review for the marks of this time; null while the pool's own are kept.
  const [reviewedMeters, setReviewedMeters] = useState<(number | null)[] | null>(null);
  const [series, setSeries] = useState<FamilySeries>(() => newFamilySeries(MIN_SWIMMERS));
  const [tick, setTick] = useState(0);
  const saving = useRef(false);
  // The videos of this person's times on this phone: where each one is in the gallery (null: deleted from it) and where the clock started.
  // A video linked to a received time has no start offset (#1201): its player has no «Ir a la salida».
  const [videoLinks, setVideoLinks] = useState<Map<string, { assetId: string; uri: string | null; startOffsetMillis: number | null }>>(new Map());
  const [videoNotice, setVideoNotice] = useState<{ step: Step; kind: VideoNoticeKind } | null>(null);
  const player = useRef<VideoPlayerHandle>(null);
  // The requests waiting for an answer: the ones this user sent, and the ones for the selected swimmer. Answered ones are hidden
  // at once (`settled`), before the sync brings the change.
  const [sent, setSent] = useState<FamilyTransfer[]>([]);
  const [received, setReceived] = useState<FamilyTransfer[]>([]);
  const [settled, setSettled] = useState<string[]>([]);
  const [answerError, setAnswerError] = useState<FamilyTransferErrorCode | null>(null);
  // The rejected time the person is asked to delete (#1025), and whether the last deletion failed.
  const [discarding, setDiscarding] = useState<string | null>(null);
  // The warning belongs to the view it appeared in: any other step (a new `step` object) or swimmer hides it.
  const [discardFailed, setDiscardFailed] = useState<{ step: Step; selectedId: string | null } | null>(null);
  const discardError = discardFailed?.step === step && discardFailed.selectedId === selectedId;
  // The codes kept from other families, read when sending; a removed one hides at once, before the sync takes it away.
  const [kept, setKept] = useState<{ id: string; code: string; athleteShortName: string; expiredAt: string | null }[]>([]);
  const [forgotten, setForgotten] = useState<string[]>([]);
  const sending = step.kind === 'send';
  useEffect(() => {
    if (!sending || !savedCodes) return;
    let current = true;
    savedCodes
      .list(userId, { includeExpired: true })
      .then((rows) => current && setKept(rows))
      .catch(() => current && setKept([]));
    return () => {
      current = false;
    };
  }, [sending, savedCodes, userId, syncKey]);
  const keptCodes = kept.filter((k) => !forgotten.includes(k.id));

  // A key press acts on the stopwatch as it is at that instant, not as it was at the last render.
  const laps = setup.pool ? lapsFor(setup.distance, setup.pool) : 1;
  // Free laps have no cap: no mark closes the last lap, and the stop key or button ends the time.
  const lapCap = freeLaps ? undefined : laps;
  const latestStopwatch = useRef(stopwatch);
  const latestSeries = useRef(series);
  const timingSeries = step.kind === 'series';
  useEffect(() => {
    latestStopwatch.current = stopwatch;
    latestSeries.current = series;
  });
  const keys = useTimingButtons({
    enabled: buttonPrefs.enabled && (step.kind === 'stopwatch' || timingSeries),
    config: { startKey: buttonPrefs.startKey, splitKey: buttonPrefs.splitKey, lockoutNanos: nanosFromSeconds(buttonPrefs.lockoutSeconds) },
    target: () => (timingSeries ? seriesTargetOf(latestSeries.current) : targetOf(latestStopwatch.current)),
    decide: timingSeries ? seriesDecide : undefined,
    vibrate: buttonPrefs.vibrate,
    port: buttons,
    onAction: (action, at) => {
      if (timingSeries) {
        latestSeries.current = pressAt(latestSeries.current, at);
        setSeries(latestSeries.current);
        return;
      }
      const sw = latestStopwatch.current;
      latestStopwatch.current = action === 'start' ? startAt(sw, at) : action === 'split' ? splitAt(sw, at, lapCap) : stopAt(sw, at);
      setStopwatch(latestStopwatch.current);
    },
  });

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const readKey = `${selectedId}:${reload}`;
    const athleteId = selectedId === UNASSIGNED ? null : selectedId;
    // An unreadable import list only hides the imported official values; the guardian's own times still show.
    const officialRead = imports && athleteId ? imports.listByAthlete(athleteId).catch(() => []) : Promise.resolve([]);
    Promise.all([repository.listByAthlete(athleteId), repository.listRejected(userId, athleteId), repository.listDeleted(athleteId), officialRead])
      .then(([measurements, rejected, deleted, imported]) => active && setRead({ status: 'ready', key: readKey, measurements, rejected, deleted, imported }))
      .catch(() => active && setRead({ status: 'error', key: readKey }));
    return () => {
      active = false;
    };
  }, [repository, userId, imports, selectedId, reload, syncKey]);

  useEffect(() => {
    if (!transfers) return;
    let active = true;
    const at = new Date().toISOString();
    const athleteId = selectedId && selectedId !== UNASSIGNED ? selectedId : null;
    // Unreadable requests only hide them; the times still show.
    Promise.all([transfers.listSent(userId, at), athleteId ? transfers.listReceived(athleteId, at) : Promise.resolve([])])
      .then(([mine, theirs]) => {
        if (!active) return;
        setSent(mine);
        setReceived(theirs);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [transfers, userId, selectedId, reload, syncKey]);

  useEffect(() => {
    let active = true;
    // An unreadable count only hides the chip; the swimmers' own times still show.
    Promise.all([repository.listByAthlete(null), repository.listRejected(userId, null)])
      .then(([times, rejected]) => active && setUnassignedCount(times.length + rejected.length))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [repository, userId, reload, syncKey]);

  // The screen stays awake and the time refreshes while the stopwatch runs.
  const running = stopwatch.status === 'running' || (step.kind === 'series' && seriesStatus(series) === 'running');
  useEffect(() => {
    if (!running) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    const timer = setInterval(() => setTick((n) => n + 1), 47);
    return () => {
      clearInterval(timer);
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [running]);

  useEffect(() => {
    if (!videos || !videoLibrary) return;
    let active = true;
    videos
      .listByUser(userId)
      .then((linked) =>
        Promise.all(linked.map(async (v) => [v.measurementId, { assetId: v.assetId, uri: await videoLibrary.uriOf(v.assetId), startOffsetMillis: v.startOffsetMillis }] as const)),
      )
      .then((entries) => active && setVideoLinks(new Map(entries)))
      // Unreadable links only hide «Ver video»; the times still show.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [videos, videoLibrary, userId, reload, syncKey]);

  const sentByMeasurement = useMemo(
    () => new Map(sent.filter((t) => !settled.includes(t.id)).map((t) => [t.measurementId, t])),
    [sent, settled],
  );
  const cardOf = useCallback(
    (m: FamilyMeasurement, match: OfficialMatch | undefined): FamilyCard => {
      const day = localDay(m.capturedAt);
      const date = formatDate(day, 'short') ?? day;
      const type = t(`family_timing.session_type.${m.sessionType}`);
      const at = new Date(m.capturedAt);
      const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
      const nowMs = Date.now();
      const age = day === localDay(new Date(nowMs).toISOString()) ? 'today' : nowMs - at.getTime() < WEEK_MS ? 'week' : 'earlier';
      const value = match?.value ?? null;
      const organization = value?.kind === 'imported' ? sourceNames[value.provider] : undefined;
      // An imported time was published in hundredths: it is shown as published, never padded to thousandths.
      const official =
        value?.kind === 'imported'
          ? {
              label: organization ? t('family_timing.card.official_imported', { organization }) : t('family_timing.card.official_imported_generic'),
              time: formatTime(value.hundredths),
            }
          : value?.kind === 'manual'
            ? { label: t('family_timing.card.official_manual'), time: format(value.millis) }
            : null;
      return {
        id: m.id,
        title: shortEventLabel(m),
        stroke: m.stroke,
        poolLabel: t(`sport.pool.${m.pool}`),
        sessionLabel: type,
        date,
        athleteId: m.athleteId,
        // The row's second line: the time of day for today's times, the date for older ones, then the short type, the pool and the lengths.
        subtitle: [
          // A time without a swimmer leads with its note: whose time it is.
          m.athleteId === null ? m.note : null,
          age === 'today' ? clock : date,
          t(`family_timing.card.type_short.${m.sessionType}`),
          `${pools.find((pool) => pool.code === m.pool)?.lengthMeters ?? ''} m`,
          m.splits.length > 0 ? t('family_timing.card.lengths', { count: m.splits.length + 1 }) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        age,
        event: eventLabel(m),
        detail: [date, type, m.competition].filter(Boolean).join(' · '),
        captured: format(m.millis),
        capturedIsHistory: official !== null,
        official,
        splitsLabel: m.splits.length > 0 ? t('family_timing.card.splits', { count: m.splits.length + 1 }) : null,
        canSetOfficial: m.sessionType === 'competition' && value?.kind !== 'imported',
        officialChoice: match && match.choices.length > 0 ? (match.chosen ? 'change' : 'choose') : null,
        hasManualOfficial: m.officialMillis !== null,
        unassigned: m.athleteId === null,
        note: m.athleteId === null ? (m.note ?? null) : null,
        sentTo: sentByMeasurement.get(m.id)?.athleteShortName ?? null,
        video: videoLinks.has(m.id) ? (videoLinks.get(m.id)!.uri ? 'available' : 'missing') : null,
        canShareVideo: !!videoSharing && !!videoLinks.get(m.id)?.uri,
        // A time someone else measured came from another family (#973): its video can be linked from what they sent.
        canLinkVideo: !!videoSharing && m.createdBy !== userId && !videoLinks.get(m.id)?.uri,
      };
    },
    [format, sourceNames, sentByMeasurement, videoLinks, videoSharing, userId],
  );
  // Which imported official result goes with each time: worked out over all the swimmer's times, so each result goes with one.
  const matches = useMemo(
    () => (loaded.status === 'ready' ? officialMatches(loaded.measurements, loaded.imported) : new Map<string, OfficialMatch>()),
    [loaded],
  );
  // The synced times and the rejected phone-only ones, newest first. A rejected time takes no part in the best time nor in the official one.
  const everyTime = useMemo(
    () =>
      loaded.status === 'ready'
        ? [...loaded.measurements, ...loaded.rejected].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt) || b.id.localeCompare(a.id))
        : [],
    [loaded],
  );
  const rejectedIds = useMemo(() => new Set(loaded.status === 'ready' ? loaded.rejected.map((m) => m.id) : []), [loaded]);
  const cards = useMemo<FamilyCard[]>(
    () =>
      everyTime.map((m) =>
        rejectedIds.has(m.id)
          ? { ...cardOf(m, undefined), canSetOfficial: false, notSent: true, canDiscard: true }
          : cardOf(m, matches.get(m.id)),
      ),
    [everyTime, rejectedIds, cardOf, matches],
  );
  // The outbox says which synced times the server rejected too (an edit it refused): marked, with their usual actions.
  const syncStates = useRecordSyncStates(
    FAMILY_MEASUREMENTS_TABLE,
    useMemo(() => everyTime.map((m) => m.id), [everyTime]),
  );
  const withSync = (card: FamilyCard): FamilyCard => (syncStates.get(card.id) === 'not_sent' ? { ...card, notSent: true } : card);
  // The list: the times that pass the filters, with the best of each event marked. The official time, when there is one, is the record.
  const listed = useMemo(() => {
    if (loaded.status !== 'ready') return { cards: [], filters: null, filtered: false };
    const all = everyTime;
    // A chosen stroke, distance or pool that none of this swimmer's times has (another swimmer, a deleted time) counts as
    // "all": its chip is not offered, so the person could not clear it and would be left on an empty list.
    const active = Object.fromEntries(
      (Object.keys(filters) as FamilyFilterKey[]).map((key) => [key, key === 'sessionType' || all.some((m) => m[key] === filters[key]) ? filters[key] : '']),
    ) as Filters;
    const shown = all.filter((m) => (Object.keys(active) as FamilyFilterKey[]).every((key) => !active[key] || m[key] === active[key]));
    const best = bestTimeIds(
      shown.filter((m) => !rejectedIds.has(m.id)).map((m) => {
        const value = matches.get(m.id)?.value ?? null;
        const time = value?.kind === 'imported' ? value.hundredths * 10 : value?.kind === 'manual' ? value.millis : m.millis;
        return { id: m.id, stroke: m.stroke, distance: m.distance, pool: m.pool, capturedAt: m.capturedAt, time };
      }),
    );
    const byId = new Map(cards.map((c) => [c.id, c]));
    const present = (key: 'stroke' | 'distance' | 'pool', catalog: readonly { code: string; nameKey: string }[]) => ({
      options: [
        { value: '', label: t('family_timing.filters.all') },
        ...catalog.filter((entry) => all.some((m) => m[key] === entry.code)).map((entry) => ({ value: entry.code, label: t(entry.nameKey) })),
      ],
      value: active[key],
    });
    const view: FamilyFiltersView = {
      sessionType: {
        options: [
          { value: '', label: t('family_timing.filters.all_types') },
          { value: 'training', label: t('family_timing.filters.training') },
          { value: 'competition', label: t('family_timing.filters.competition') },
        ],
        value: active.sessionType,
      },
      stroke: present('stroke', strokes),
      distance: present('distance', distances),
      pool: present('pool', pools),
    };
    return {
      cards: shown.flatMap((m) => {
        const card = byId.get(m.id);
        return card ? [{ ...card, notSent: card.notSent || syncStates.get(card.id) === 'not_sent', isBest: best.has(m.id) }] : [];
      }),
      filters: all.length > 0 ? view : null,
      filtered: Object.values(active).some(Boolean),
    };
  }, [loaded, everyTime, rejectedIds, cards, filters, matches, syncStates]);
  const deletedCards = useMemo<FamilyDeletedCard[]>(() => {
    if (loaded.status !== 'ready') return [];
    return loaded.deleted.map((m) => {
      const removed = new Date(Date.parse(m.deletedAt ?? m.capturedAt) + KEEP_DELETED_DAYS * 86_400_000).toISOString();
      const day = localDay(removed);
      // A deleted time takes no part in the choice: it shows its official value and offers nothing to pick.
      const match = officialMatches([m], loaded.imported).get(m.id);
      return { ...cardOf(m, match && { ...match, choices: [] }), removedOn: formatDate(day, 'short') ?? day };
    });
  }, [loaded, cardOf]);
  // A request for the selected swimmer: the time as the other family sent it.
  const receivedCards = received
    .filter((r) => !settled.includes(r.id))
    .map((r) => {
      const day = localDay(r.capturedAt);
      return {
        id: r.id,
        event: eventLabel(r),
        detail: [formatDate(day, 'short') ?? day, t(`family_timing.session_type.${r.sessionType}`), r.competition].filter(Boolean).join(' · '),
        captured: format(r.millis),
        splitsLabel: r.splits.length > 0 ? t('family_timing.card.splits', { count: r.splits.length + 1 }) : null,
      };
    });
  // Everything known about one time: who swam it, when, the session, and each lap from the stored cumulative splits.
  const detailOf = (card: FamilyCard, m: FamilyMeasurement): FamilyDetailView => {
    const day = localDay(m.capturedAt);
    const at = new Date(m.capturedAt);
    const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    const athlete = athletes.find((a) => a.id === m.athleteId);
    const rows = [
      { label: t('family_timing.detail.athlete'), value: athlete ? [athlete.firstName, athlete.lastName].filter(Boolean).join(' ') : t('family_timing.unassigned') },
      ...(!athlete && m.note ? [{ label: t('family_timing.detail.note'), value: m.note }] : []),
      { label: t('family_timing.detail.when'), value: `${formatDate(day, 'long') ?? day} · ${clock}` },
      { label: t('family_timing.detail.session'), value: t(`family_timing.session_type.${m.sessionType}`) },
      ...(m.competition ? [{ label: t('family_timing.detail.competition'), value: m.competition }] : []),
      { label: t('family_timing.detail.event'), value: eventLabel(m) },
    ];
    const raw = lapRows(m.splits, m.millis, m.splits.length > 0);
    const meters = lapMeters(m.distance, m.pool, raw.length);
    const laps = raw.map(({ lap, total }, i) => ({
      lap: formatLap(lap),
      total: formatLap(total),
      distance: meters ? `${meters[i]} m` : String(i + 1),
    }));
    // The slowest length against the fastest, when every length has a time.
    const known = raw.map((r) => r.lap);
    let slowest: string | null = null;
    if (known.length > 1 && known.every((v): v is number => v !== null)) {
      const values = known as number[];
      const max = Math.max(...values);
      const min = Math.min(...values);
      const index = values.indexOf(max);
      const digits = precision === 'thousandths' ? 3 : 2;
      slowest =
        max > min
          ? t('family_timing.detail.slowest', { number: index + 1, diff: ((max - min) / 1000).toFixed(digits).replace('.', ',') })
          : null;
    }
    // The meters of the marks: the ones saved with the time, or (an older time) k x the pool's length from `lapMeters`.
    const markMeters = m.splitMeters?.length === m.splits.length ? m.splitMeters : (lapMeters(m.distance, m.pool, m.splits.length + 1)?.slice(0, m.splits.length) ?? null);
    const distanceMeters = distances.find((d) => d.code === m.distance)?.meters ?? 0;
    const pace =
      m.millis !== null && m.splits.length > 0 && markMeters && distanceMeters > 0
        ? { marks: m.splits.map((time, i) => ({ t: time, meters: markMeters[i] ?? null })), finalTime: m.millis, distance: distanceMeters, formatTime: (v: number) => formatLap(v) }
        : undefined;
    return {
      card,
      rows,
      laps,
      pace,
      when: `${formatDate(day, 'short') ?? day} · ${clock}`,
      session: t(`family_timing.session_type.${m.sessionType}`),
      lapsSummary: raw.length > 0 ? t('family_timing.detail.laps_summary', { count: raw.length, distance: t(`sport.distance.${m.distance}`) }) : null,
      slowest,
      athleteId: m.athleteId,
    };
  };
  const listView = (): FamilyTimingView => ({
    kind: 'list',
    cards: listed.cards,
    deletedCount: deletedCards.length,
    filters: listed.filters,
    filtered: listed.filtered,
    showNotice,
    received: receivedCards,
    transferError: answerError ? t(`family_timing.transfer.error.${answerError}`) : null,
  });

  // Answers a request (or withdraws one); it leaves the screen at once, and the sync brings the moved time.
  async function answer(id: string, write: (id: string) => Promise<void>): Promise<boolean> {
    if (saving.current) return false;
    saving.current = true;
    setAnswerError(null);
    try {
      await write(id);
      setSettled((current) => [...current, id]);
      setReload((n) => n + 1);
      return true;
    } catch (error) {
      setAnswerError(error instanceof FamilyTransferError ? error.code : 'failed');
      return false;
    } finally {
      saving.current = false;
    }
  }

  // The last lookup wins: an older answer, or one for a code the person has since replaced, is dropped.
  const lookup = useRef(0);
  // A scanned code (issue 1322) arrives as the argument and goes through the same lookup as a typed one.
  async function lookUpCode(scannedCode?: string) {
    const code = (scannedCode ?? (step.kind === 'send' ? step.code : '')).trim();
    if (step.kind !== 'send' || !shareCodes || !code) return;
    const id = ++lookup.current;
    setStep((s) => (s.kind === 'send' ? { ...s, code, busy: true, error: null, found: null, scan: null, scanNotice: null } : s));
    try {
      const name = await shareCodes.find(code);
      if (id === lookup.current) setStep((s) => (s.kind === 'send' ? { ...s, busy: false, found: name, error: name ? null : 'unknown_code' } : s));
    } catch (error) {
      const code: FamilyTransferErrorCode = error instanceof Error && error.name === 'TooManyShareCodeLookupsError' ? 'too_many_attempts' : 'failed';
      if (id === lookup.current) setStep((s) => (s.kind === 'send' ? { ...s, busy: false, error: code } : s));
    }
  }

  // Reading the code from a QR: the explanation the first time, then the permission, then the camera. Whatever goes wrong leaves the code field and a line saying why.
  const scanning = useRef(false);
  const endScan = (scanNotice: 'invalid' | 'denied' | 'error' | null) => {
    scanning.current = false;
    setStep((s) => (s.kind === 'send' ? { ...s, scan: null, scanNotice } : s));
  };
  async function askScanPermission() {
    if (!qrScanner) return;
    scanning.current = true;
    setStep((s) => (s.kind === 'send' ? { ...s, scan: 'asking', scanNotice: null } : s));
    const granted = await qrScanner.requestPermission().catch(() => false);
    if (!scanning.current) return;
    if (granted) setStep((s) => (s.kind === 'send' && s.scan === 'asking' ? { ...s, scan: 'scanning' } : s));
    else endScan('denied');
  }
  async function startScan() {
    if (step.kind !== 'send' || !qrScanner) return;
    const seen = scanIntro ? await scanIntro.seen(userId).catch(() => true) : true;
    if (seen) return askScanPermission();
    setStep((s) => (s.kind === 'send' ? { ...s, scan: 'intro', scanNotice: null } : s));
  }
  function continueScanIntro() {
    scanIntro?.markSeen(userId).catch(() => undefined);
    void askScanPermission();
  }
  // The camera may report the same QR many times: the first one counts.
  function scannedQr(data: string) {
    if (!scanning.current) return;
    scanning.current = false;
    const code = shareCodeFromQr(data);
    if (code) void lookUpCode(code);
    else endScan('invalid');
  }

  // A kept code its family changed: the person is told once (the step keeps the name), and the entry is removed. If removing fails
  // (no signal) it stays expired and unpickable, and the next touch tries again.
  async function expireKeptCode(id: string, name: string) {
    setStep((s) => (s.kind === 'send' ? { ...s, code: '', found: null, error: null, busy: false, savedId: null, expired: name } : s));
    try {
      await savedCodes?.forget(id);
      setForgotten((list) => [...list, id]);
    } catch {
      // The entry stays; see above.
    }
  }

  async function sendTime() {
    if (step.kind !== 'send' || !transfers || !step.found || saving.current) return;
    const { savedId, found } = step;
    saving.current = true;
    setStep({ ...step, busy: true, error: null });
    try {
      await transfers.send(step.id, step.code.trim());
      // With its video on this phone, the time's video can go to the same family now, before the time leaves this account.
      setStep(videoSharing && videoLinks.get(step.id)?.uri ? { kind: 'video_offer', offer: 'share', id: step.id, name: step.found } : { kind: 'list' });
      setReload((n) => n + 1);
    } catch (error) {
      const code = error instanceof FamilyTransferError ? error.code : 'failed';
      // The server no longer knows a code picked from the kept ones: its family changed it before this phone synced. A typed code keeps its error.
      if (code === 'unknown_code' && savedId) void expireKeptCode(savedId, found);
      else setStep((s) => (s.kind === 'send' ? { ...s, busy: false, error: code } : s));
    } finally {
      saving.current = false;
    }
  }

  // Opens the share menu with the time's video (#1201); from the offer after sending, the list follows.
  async function shareVideo(id: string) {
    const link = videoLinks.get(id);
    if (!videoSharing || !link?.uri) return;
    const from = step;
    const next: Step = from.kind === 'video_offer' ? { kind: 'list' } : from;
    if (await videoSharing.share(link.assetId, t('family_timing.video_share.chooser'))) {
      if (next !== from) setStep(next);
    } else setVideoNotice({ step: from, kind: 'share_failed' });
  }

  // The person chooses the video they received; it is linked only when its name says it is this time's, or they confirm.
  async function linkVideo(id: string) {
    if (!videoSharing || saving.current) return;
    const from = step;
    const picked = await videoSharing.pick();
    if (!picked) return;
    const result = videoMatchesTime(picked.name, id);
    if (result === 'same') await adoptVideo(id, picked, from);
    else setStep({ kind: 'link_check', id, picked, result });
  }

  async function adoptVideo(id: string, picked: PickedVideo, from: Step) {
    if (!videoSharing || !videos || saving.current) return;
    saving.current = true;
    try {
      const { assetId, originalRemoved } = await videoSharing.adopt(picked, videoName(id));
      await videos.link(userId, { measurementId: id, assetId, startOffsetMillis: null });
      const next: Step = everyTime.some((m) => m.id === id) ? { kind: 'detail', id } : { kind: 'list' };
      setStep(next);
      setVideoNotice({ step: next, kind: originalRemoved ? 'linked' : 'linked_original_kept' });
      setReload((n) => n + 1);
    } catch {
      setVideoNotice({ step: from, kind: 'link_failed' });
    } finally {
      saving.current = false;
    }
  }

  const goToList = () => {
    setStep({ kind: 'list' });
    setStopwatch(idleFamilyStopwatch);
    setReviewedMeters(null);
    setSeries(newFamilySeries(setup.swimmers));
  };

  async function saveSeries() {
    if (saving.current || step.kind !== 'series_assign' || !setup.pool) return;
    saving.current = true;
    const pool = setup.pool;
    const times = arrivalMillis(series);
    const capturedAt = new Date().toISOString();
    const competition = setup.sessionType === 'competition' && setup.competition.trim() ? setup.competition.trim() : null;
    const measurements: FamilyMeasurement[] = step.lanes.map((lane, index) => ({
      id: randomUUID(),
      athleteId: lane.athleteId,
      createdBy: userId,
      stroke: lane.stroke,
      distance: setup.distance,
      pool,
      sessionType: setup.sessionType,
      competition,
      capturedAt,
      millis: times[index] ?? null,
      splits: [],
      officialMillis: null,
      officialSetAt: null,
    }));
    try {
      await repository.addMany(measurements);
      goToList();
      setReload((n) => n + 1);
    } catch {
      setStep({ ...step, saveError: true });
    } finally {
      saving.current = false;
    }
  }

  // The meters of each mark of a free-laps time: the ones the person set in the review, or k x the pool's length (null once a mark
  // reaches the distance). null when the time has no marks. The final mark is the whole distance, kept in the measurement itself.
  const metersOf = (sw: FamilyStopwatch, free: boolean): (number | null)[] | null => {
    const count = sw.status === 'idle' ? 0 : sw.splitMarks.length;
    if (!free || count === 0 || !setup.pool) return null;
    if (reviewedMeters?.length === count) return reviewedMeters;
    const poolLength = pools.find((p) => p.code === setup.pool)?.lengthMeters ?? 0;
    const distance = distances.find((d) => d.code === setup.distance)?.meters ?? 0;
    return defaultSplitMeters(count, poolLength, distance);
  };

  // Pace and projection of a stopped free-laps time, with the meters of its marks (reviewed or the pool's). Without the final time
  // or the meters there is nothing to compute.
  const stoppedPace = (): PaceSummaryProps | undefined => {
    const final = finalMillis(stopwatch);
    const meters = metersOf(stopwatch, freeLaps);
    const distanceMeters = distances.find((d) => d.code === setup.distance)?.meters ?? 0;
    if (stopwatch.status !== 'stopped' || final === null || !meters || distanceMeters === 0) return undefined;
    return { marks: splitMillis(stopwatch).map((time, i) => ({ t: time, meters: meters[i] ?? null })), finalTime: final, distance: distanceMeters, formatTime: (v) => formatLap(v) };
  };

  // The time as the stopwatch measured it, ready for Mis tiempos; the same with or without video. The video keeps the restricted
  // stopwatch (free laps in the video are out of scope), so it passes `free = false`.
  const measurementOf = (sw: FamilyStopwatch, free = freeLaps): FamilyMeasurement | null =>
    sw.status !== 'stopped' || !setup.pool
      ? null
      : {
          id: randomUUID(),
          athleteId: setup.athleteId,
          createdBy: userId,
          stroke: setup.stroke,
          distance: setup.distance,
          pool: setup.pool,
          sessionType: setup.sessionType,
          competition: setup.sessionType === 'competition' && setup.competition.trim() ? setup.competition.trim() : null,
          capturedAt: new Date().toISOString(),
          millis: finalMillis(sw),
          splits: splitMillis(sw),
          splitMeters: metersOf(sw, free),
          officialMillis: null,
          officialSetAt: null,
          note: setup.athleteId === null ? cleanNote(setup.note) : null,
        };

  // After saving, the list shows where the time went: its swimmer, or "Sin asignar".
  const showSaved = (measurement: FamilyMeasurement) => setChosenId(measurement.athleteId ?? UNASSIGNED);

  async function save() {
    if (saving.current || stopwatch.status !== 'stopped' || !selectedId || !setup.pool) return;
    const measurement = measurementOf(stopwatch);
    if (!measurement) return;
    saving.current = true;
    try {
      await repository.add(measurement);
      showSaved(measurement);
      goToList();
      setReload((n) => n + 1);
    } catch {
      setStep({ kind: 'stopwatch', saveError: true });
    } finally {
      saving.current = false;
    }
  }

  async function writeOfficial(id: string, millis: number | null) {
    try {
      await repository.setOfficial(id, millis, new Date().toISOString());
      setStep({ kind: 'list' });
      setReload((n) => n + 1);
    } catch {
      setRead({ status: 'error', key });
      setStep({ kind: 'list' });
    }
  }

  async function change(write: () => Promise<void>, onError: () => void, next: Step = { kind: 'list' }) {
    if (saving.current) return;
    saving.current = true;
    try {
      await write();
      setStep(next);
      setReload((n) => n + 1);
    } catch {
      onError();
    } finally {
      saving.current = false;
    }
  }

  const athleteOptions: ChipRowOption<string>[] = athletes.map((a) => {
    const { shortName, initials, color } = athleteDisplay(a);
    return { value: a.id, label: shortName, dot: { initials, color, avatar: Avatar && <Avatar athleteId={a.id} initials={initials} color={color} size="sm" /> } };
  });
  const unassignedOption: ChipRowOption<string> = { value: UNASSIGNED, label: t('family_timing.unassigned') };
  const chips = unassignedCount > 0 ? [...athleteOptions, unassignedOption] : athleteOptions;

  const option = (code: string, nameKey: string) => ({ value: code, label: t(nameKey) });
  let view: FamilyTimingView;
  if (athletes.length === 0) view = { kind: 'no_athletes' };
  else if (step.kind === 'setup')
    view = {
      kind: 'setup',
      setup: {
        mode: {
          options: (['individual', 'series'] as const).map((mode) => ({ value: mode, label: t(`family_timing.setup.mode_${mode}`) })),
          value: setup.mode,
        },
        swimmers: { options: swimmerCounts.map((n) => ({ value: n, label: n })), value: String(setup.swimmers) },
        stroke: { options: strokes.map((s) => option(s.code, s.nameKey)), value: setup.stroke },
        distance: { options: distances.map((d) => option(d.code, d.nameKey)), value: setup.distance },
        pool: { options: pools.map((p) => option(p.code, p.nameKey)), value: setup.pool ?? '' },
        sessionType: {
          options: (['training', 'competition'] as const).map((type) => ({ value: type, label: t(`family_timing.session_type.${type}`) })),
          value: setup.sessionType,
        },
        competition: setup.competition,
        // Individual mode only: a series gives each lane its swimmer after the arrivals.
        athlete: { options: [...athleteOptions, unassignedOption], value: setup.athleteId ?? UNASSIGNED },
        note: setup.athleteId === null ? setup.note : null,
      },
    };
  else if (step.kind === 'stopwatch') {
    void tick;
    const elapsed = elapsedMillisAt(stopwatch, now());
    view = {
      kind: 'stopwatch',
      saveError: step.saveError,
      stopwatch: {
        status: stopwatch.status,
        time: stopwatch.status === 'idle' ? format(0) : format(elapsed),
        laps: lapRows(splitMillis(stopwatch), finalMillis(stopwatch), freeLaps || laps > 1).map(({ lap, total }) => ({ lap: formatLap(lap), total: formatLap(total) })),
        // "Lap 2 de 4" counts towards the cap; free laps have none.
        lapProgress:
          !freeLaps && laps > 1 && stopwatch.status === 'running'
            ? t('family_timing.stopwatch.lap_progress', { current: stopwatch.splitMarks.length + 1, total: laps })
            : null,
        hasLaps: freeLaps || laps > 1,
        canReviewMeters: freeLaps && stopwatch.status === 'stopped' && stopwatch.splitMarks.length > 0,
        pace: stoppedPace(),
        event: eventLabel({ ...setup, pool: setup.pool ?? '' }),
        noTime: stopwatch.status === 'stopped' && finalMillis(stopwatch) === null,
        buttonsHint: keys.active ? buttonsHint(buttonPrefs.startKey, buttonPrefs.splitKey, keys.keyboards[0]?.name) : null,
        canRecord: Boolean(videoCamera) && stopwatch.status === 'idle',
        videoNotice: step.videoNotice ? t(`family_timing.video.${step.videoNotice}`) : null,
      },
    };
  } else if (step.kind === 'series') {
    void tick;
    const status = seriesStatus(series);
    const times = arrivalMillis(series);
    view = {
      kind: 'series',
      series: {
        status,
        time: format(seriesElapsedAt(series, now()) ?? 0),
        arrivals: times.map((time, index) => ({ position: index + 1, time: format(time) })),
        progress: t('family_timing.series.progress', { count: times.length, total: series.size }),
        event: seriesEventLabel({ ...setup, pool: setup.pool ?? '' }),
        buttonsHint: keys.active ? seriesButtonsHint(buttonPrefs.startKey, keys.keyboards[0]?.name) : null,
      },
    };
  } else if (step.kind === 'series_assign') {
    const times = arrivalMillis(series);
    view = {
      kind: 'series_assign',
      saveError: step.saveError,
      event: seriesEventLabel({ ...setup, pool: setup.pool ?? '' }),
      lanes: step.lanes.map((lane, index) => {
        // An athlete swims one lane: the ones in another lane are not offered here.
        const taken = new Set(step.lanes.flatMap((other, i) => (i !== index && other.athleteId ? [other.athleteId] : [])));
        return {
          position: index + 1,
          time: format(times[index] ?? null),
          athlete: { options: [unassignedOption, ...athleteOptions.filter((a) => !taken.has(a.value))], value: lane.athleteId ?? UNASSIGNED },
          stroke: { options: strokes.map((s) => option(s.code, s.nameKey)), value: lane.stroke },
        };
      }),
    };
  } else if (step.kind === 'choose_official') {
    const card = cards.find((c) => c.id === step.id);
    const match = matches.get(step.id);
    view =
      card && match
        ? {
            kind: 'choose_official',
            choose: {
              card,
              options: match.choices.map((r) => {
                const organization = sourceNames[r.provider];
                return {
                  key: officialResultKeyOf(r),
                  time: formatTime(r.hundredths),
                  detail: [organization ?? t('family_timing.card.official_imported_generic'), r.competition].filter(Boolean).join(' · '),
                  selected: match.chosen && match.value?.kind === 'imported' && match.value.importedId === r.id,
                };
              }),
              saveError: step.saveError,
            },
          }
        : listView();
  } else if (step.kind === 'official') {
    const card = cards.find((c) => c.id === step.id);
    view = card ? { kind: 'official', card, text: step.text, invalid: step.invalid } : listView();
  } else if (loaded.status === 'loading') view = { kind: 'loading' };
  else if (loaded.status === 'error') view = { kind: 'error' };
  else if (step.kind === 'edit') {
    const card = cards.find((c) => c.id === step.id);
    view = card
      ? {
          kind: 'edit',
          edit: {
            card,
            stroke: { options: strokes.map((s) => option(s.code, s.nameKey)), value: step.stroke },
            // Only a training time corrects its distance. (A time waiting for another family's answer does not open this screen.)
            distance:
              everyTime.find((x) => x.id === step.id)?.sessionType === 'training'
                ? { options: distances.map((d) => option(d.code, d.nameKey)), value: step.distance }
                : null,
            // "Sin asignar" is always offered: a time of someone else's child waits there, with a note, until it is sent.
            athlete: { options: [...athleteOptions, unassignedOption], value: step.athleteId ?? UNASSIGNED },
            note: step.athleteId === null ? step.note : null,
            confirmingDelete: step.confirmingDelete,
            saveError: step.saveError,
            canSend: !!transfers && !!shareCodes,
          },
        }
      : listView();
  } else if (step.kind === 'deleted') view = { kind: 'deleted', cards: deletedCards, restoreError: step.restoreError };
  else if (step.kind === 'detail') {
    const card = cards.find((c) => c.id === step.id);
    const m = everyTime.find((x) => x.id === step.id);
    view = card && m ? { kind: 'detail', detail: detailOf(withSync(card), m) } : listView();
  }
  else if (step.kind === 'send') {
    const card = cards.find((c) => c.id === step.id);
    view = card
      ? {
          kind: 'send',
          send: {
            card,
            code: step.code,
            found: step.found,
            busy: step.busy,
            error: step.error ? t(`family_timing.transfer.error.${step.error}`) : null,
            saved: {
              options: keptCodes.map((k) => ({
                value: k.id,
                label: k.expiredAt
                  ? t('family_timing.transfer.saved_expired_option', { name: k.athleteShortName, code: k.code })
                  : `${k.athleteShortName} · ${k.code}`,
              })),
              value: step.savedId ?? '',
            },
            expired: step.expired ? t('family_timing.transfer.saved_expired', { name: step.expired }) : null,
            canScan: !!qrScanner && !!shareCodes,
            scan:
              step.scan === 'intro'
                ? { phase: 'intro' }
                : step.scan === 'asking'
                  ? { phase: 'asking' }
                  : step.scan === 'scanning' && qrScanner
                    ? { phase: 'scanning', scanner: <qrScanner.Scanner onScan={scannedQr} onError={() => endScan('error')} style={{ flex: 1 }} /> }
                    : null,
            scanNotice: step.scanNotice ? t(`family_timing.transfer.scan_${step.scanNotice}`) : null,
          },
        }
      : listView();
  }
  else if (step.kind === 'video_offer') view = { kind: 'video_offer', offer: step.offer, id: step.id, name: step.name };
  else if (step.kind === 'link_check') view = { kind: 'link_check', id: step.id, result: step.result };
  else view = listView();

  if (step.kind === 'time_video' && videoLibrary) {
    const m = everyTime.find((x) => x.id === step.id);
    const link = videoLinks.get(step.id);
    const back = () => setStep(step.from === 'detail' ? { kind: 'detail', id: step.id } : { kind: 'list' });
    if (m && link?.uri) {
      const day = localDay(m.capturedAt);
      return (
        <VideoPlayerScreen
          event={eventLabel(m)}
          detail={[formatDate(day, 'short') ?? day, format(m.millis)].join(' · ')}
          player={<videoLibrary.Player ref={player} uri={link.uri} style={{ flex: 1 }} />}
          onJumpToStart={link.startOffsetMillis === null ? undefined : () => player.current?.seekTo((link.startOffsetMillis ?? 0) - JUMP_LEAD_MILLIS)}
          onBack={back}
        />
      );
    }
  }

  if (step.kind === 'meters' && stopwatch.status === 'stopped' && setup.pool) {
    const toStopwatch = () => setStep({ kind: 'stopwatch', saveError: false });
    const marks = splitMillis(stopwatch);
    const meters = metersOf(stopwatch, true) ?? [];
    return (
      <SplitMetersScreen
        subtitle={eventLabel({ ...setup, pool: setup.pool })}
        distance={distances.find((d) => d.code === setup.distance)?.meters ?? 0}
        splits={marks.map((total, i) => ({ label: t('family_timing.stopwatch.meters_label', { number: i + 1, total: formatLap(total) }), meters: meters[i] ?? null }))}
        onSave={(values) => {
          setReviewedMeters(values);
          toStopwatch();
        }}
        onBack={toStopwatch}
      />
    );
  }

  if (step.kind === 'video' && videoCamera && setup.pool) {
    return (
      <VideoStopwatchContainer
        event={eventLabel({ ...setup, pool: setup.pool })}
        laps={laps}
        now={now}
        buttons={buttons}
        camera={videoCamera}
        intro={videoIntro ? { store: videoIntro, userId } : undefined}
        buttonsHint={(keyboard) => buttonsHint(buttonPrefs.startKey, buttonPrefs.splitKey, keyboard)}
        saveTime={async (sw) => {
          const measurement = measurementOf(sw, false);
          if (!measurement) throw new Error('The stopwatch is not stopped');
          await repository.add(measurement);
          showSaved(measurement);
          return measurement.id;
        }}
        linkVideo={videos ? (measurementId, assetId, startOffsetMillis) => videos.link(userId, { measurementId, assetId, startOffsetMillis }) : undefined}
        onClose={(result) => {
          if (result === 'saved') {
            goToList();
            setReload((n) => n + 1);
          } else if (result === 'discarded') goToList();
          else {
            // The time is saved even when the video is not: the list reloads, and the notice shows in the stopwatch.
            if (result === 'saved_no_video') setReload((n) => n + 1);
            setStopwatch(idleFamilyStopwatch);
            setStep({ kind: 'stopwatch', saveError: false, videoNotice: result });
          }
        }}
      />
    );
  }

  return (
    <FamilyTimingScreen
      view={view}
      athletes={chips.map(({ value, label, dot }) => ({ id: value, name: label, dot }))}
      selectedId={selectedId}
      onSelectAthlete={setChosenId}
      onBack={onBack}
      onRetry={() => setReload((n) => n + 1)}
      onNew={() => {
        // A new time goes to a swimmer by default: the one shown, or the first one while "Sin asignar" is shown.
        setSetup((current) => ({ ...current, athleteId: selectedId !== UNASSIGNED && selectedId ? selectedId : (athletes[0]?.id ?? null), note: '' }));
        setStep({ kind: 'setup' });
      }}
      onSetupChange={(field, value) =>
        setSetup((current) =>
          field === 'swimmers'
            ? { ...current, swimmers: Number(value) }
            : field === 'athleteId'
              ? { ...current, athleteId: value === UNASSIGNED ? null : value }
              : { ...current, [field]: value },
        )
      }
      onGoToStopwatch={() => {
        if (!setup.pool) return;
        if (setup.mode === 'series') {
          setSeries(newFamilySeries(setup.swimmers));
          setStep({ kind: 'series' });
          return;
        }
        setStopwatch(idleFamilyStopwatch);
        setStep({ kind: 'stopwatch', saveError: false });
      }}
      onSeriesPress={() => setSeries((fs) => pressAt(fs, now()))}
      onUndoLast={() => setSeries(undoLast)}
      onAssignSwimmers={() => {
        if (seriesStatus(series) !== 'done') return;
        // Every lane starts without a swimmer and with the stroke chosen before the start.
        setStep({ kind: 'series_assign', saveError: false, lanes: Array.from({ length: series.size }, () => ({ athleteId: null, stroke: setup.stroke })) });
      }}
      onBackToSeries={() => setStep({ kind: 'series' })}
      onLaneChange={(index, field, value) =>
        setStep((s) =>
          s.kind === 'series_assign'
            ? {
                ...s,
                saveError: false,
                lanes: s.lanes.map((lane, i) =>
                  i !== index ? lane : field === 'stroke' ? { ...lane, stroke: value as StrokeCode } : { ...lane, athleteId: value === UNASSIGNED ? null : value },
                ),
              }
            : s,
        )
      }
      onSaveSeries={saveSeries}
      onCancel={goToList}
      onStart={() => setStopwatch((sw) => startAt(sw, now()))}
      onReviewMeters={() => setStep({ kind: 'meters' })}
      onOpenVideo={() => {
        if (!videoCamera || stopwatch.status !== 'idle') return;
        setStep({ kind: 'video' });
      }}
      onSplit={() => setStopwatch((sw) => splitAt(sw, now(), lapCap))}
      onStop={() => setStopwatch((sw) => stopAt(sw, now()))}
      onSave={save}
      onDiscard={goToList}
      onOpenOfficial={(id) => {
        const m = loaded.status === 'ready' ? loaded.measurements.find((x) => x.id === id) : undefined;
        setStep({ kind: 'official', id, text: m?.officialMillis != null ? formatMillis(m.officialMillis, { precision: 'thousandths' }) : '', invalid: false });
      }}
      onOfficialText={(text) => setStep((s) => (s.kind === 'official' ? { ...s, text, invalid: false } : s))}
      onSaveOfficial={() => {
        if (step.kind !== 'official') return;
        const entry = parseTimeEntry(step.text);
        if (!entry.ok) setStep({ ...step, invalid: true });
        else writeOfficial(step.id, entry.value);
      }}
      onClearOfficial={() => step.kind === 'official' && writeOfficial(step.id, null)}
      onOpenDetail={(id) => setStep({ kind: 'detail', id })}
      onOpenTimeVideo={
        videoLibrary
          ? (id) => {
              if (videoLinks.get(id)?.uri) setStep({ kind: 'time_video', id, from: step.kind === 'detail' ? 'detail' : 'list' });
            }
          : undefined
      }
      onOpenChooseOfficial={(id) => setStep({ kind: 'choose_official', id, saveError: false })}
      onChooseOfficial={(resultKey) => {
        if (step.kind !== 'choose_official') return;
        const id = step.id;
        void change(
          () => repository.chooseOfficial(id, resultKey),
          () => setStep({ kind: 'choose_official', id, saveError: true }),
        );
      }}
      onOpenEdit={(id) => {
        const m = loaded.status === 'ready' ? loaded.measurements.find((x) => x.id === id) : undefined;
        if (m)
          setStep({ kind: 'edit', id, stroke: m.stroke, athleteId: m.athleteId, distance: m.distance, note: m.note ?? '', confirmingDelete: false, saveError: false });
      }}
      onEditChange={(field, value) =>
        setStep((s) =>
          s.kind === 'edit'
            ? {
                ...s,
                saveError: false,
                ...(field === 'stroke'
                  ? { stroke: value as StrokeCode }
                  : field === 'distance'
                    ? { distance: value as DistanceCode }
                    : field === 'note'
                      ? { note: value }
                      : { athleteId: value === UNASSIGNED ? null : value }),
              }
            : s,
        )
      }
      onSaveEdit={() => {
        if (step.kind !== 'edit') return;
        const m = loaded.status === 'ready' ? loaded.measurements.find((x) => x.id === step.id) : undefined;
        if (!m) return;
        // The note counts only while the time stays without a swimmer; given to one, the repository clears it.
        const note = step.athleteId === null ? cleanNote(step.note) : null;
        const changes = {
          ...(step.stroke !== m.stroke ? { stroke: step.stroke } : {}),
          ...(step.athleteId !== m.athleteId ? { athleteId: step.athleteId } : {}),
          ...(step.distance !== m.distance && m.sessionType === 'training' ? { distance: step.distance } : {}),
          ...(step.athleteId === null && note !== (m.note ?? null) ? { note } : {}),
        };
        if (Object.keys(changes).length === 0) return goToList();
        // A time moved to another swimmer leaves this list: the list now shows that swimmer, where the time went.
        const moved = changes.athleteId;
        change(
          async () => {
            await repository.edit(step.id, changes);
            if (moved !== undefined) setChosenId(moved ?? UNASSIGNED);
          },
          () => setStep({ ...step, saveError: true }),
        );
      }}
      onAskDelete={() => setStep((s) => (s.kind === 'edit' ? { ...s, confirmingDelete: true } : s))}
      onCancelDelete={() => setStep((s) => (s.kind === 'edit' ? { ...s, confirmingDelete: false } : s))}
      onConfirmDelete={() => {
        if (step.kind !== 'edit') return;
        change(
          () => repository.remove(step.id, new Date().toISOString()),
          () => setStep({ ...step, confirmingDelete: false, saveError: true }),
        );
      }}
      confirmingDiscard={discarding !== null}
      discardError={discardError}
      onAskDiscard={(id) => {
        setDiscardFailed(null);
        setDiscarding(id);
      }}
      onCancelDiscard={() => setDiscarding(null)}
      onConfirmDiscard={() => {
        const id = discarding;
        if (!id) return;
        void change(
          async () => {
            await repository.discardRejected(userId, id);
            setDiscarding(null);
          },
          () => {
            setDiscarding(null);
            setDiscardFailed({ step, selectedId });
          },
        );
      }}
      onOpenDeleted={() => setStep({ kind: 'deleted', restoreError: false })}
      onOpenSend={() => step.kind === 'edit' && setStep({ kind: 'send', id: step.id, code: '', found: null, error: null, busy: false })}
      // Changing the code drops the answer of a lookup still on its way.
      onSendCode={(code) => {
        lookup.current += 1;
        setStep((s) => (s.kind === 'send' ? { ...s, code, found: null, error: null, busy: false, savedId: null, expired: null } : s));
      }}
      onEnterNewCode={() => {
        lookup.current += 1;
        setStep((s) => (s.kind === 'send' ? { ...s, code: '', found: null, error: null, busy: false, savedId: null, expired: null } : s));
      }}
      // A kept code was already accepted by that family: its swimmer is known, so it goes straight to «Enviar a …» without a lookup.
      onPickSavedCode={(id) => {
        const k = keptCodes.find((x) => x.id === id);
        if (!k) return;
        // An expired one is never picked: it is explained and removed instead.
        if (k.expiredAt) void expireKeptCode(k.id, k.athleteShortName);
        else {
          lookup.current += 1;
          setStep((s) => (s.kind === 'send' ? { ...s, code: k.code, found: k.athleteShortName, error: null, busy: false, savedId: k.id, expired: null } : s));
        }
      }}
      onForgetSavedCode={async () => {
        if (step.kind !== 'send' || !step.savedId || !savedCodes) return;
        const id = step.savedId;
        try {
          await savedCodes.forget(id);
          setForgotten((list) => [...list, id]);
          setStep((s) => (s.kind === 'send' ? { ...s, code: '', found: null, error: null, savedId: null } : s));
        } catch {
          setStep((s) => (s.kind === 'send' ? { ...s, error: 'failed' } : s));
        }
      }}
      onLookUpCode={() => void lookUpCode()}
      onScanQr={() => void startScan()}
      onScanContinue={continueScanIntro}
      onScanCancel={() => endScan(null)}
      onSendTime={sendTime}
      onWithdraw={(measurementId) => {
        const transfer = sentByMeasurement.get(measurementId);
        if (transfers && transfer) answer(transfer.id, transfers.withdraw);
      }}
      onAccept={async (id) => {
        if (!transfers) return;
        const measurementId = received.find((r) => r.id === id)?.measurementId;
        // Accepted, the family is asked whether they have the time's video, to link it (#1201). It is optional.
        if ((await answer(id, transfers.accept)) && videoSharing && measurementId) setStep({ kind: 'video_offer', offer: 'link', id: measurementId, name: null });
      }}
      onReject={(id) => transfers && answer(id, transfers.reject)}
      videoNotice={
        videoNotice?.step === step ? { variant: VIDEO_NOTICE_VARIANT[videoNotice.kind], text: t(`family_timing.video_share.${videoNotice.kind}`) } : null
      }
      onShareVideo={videoSharing ? (id) => void shareVideo(id) : undefined}
      onLinkVideo={videoSharing ? (id) => void linkVideo(id) : undefined}
      onLinkAnyway={() => step.kind === 'link_check' && step.result === 'unknown' && void adoptVideo(step.id, step.picked, step)}
      onFilter={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
      onApplyFilters={(values) => setFilters((current) => ({ ...current, ...values }))}
      onRestore={(id) =>
        change(
          () => repository.restore(id),
          () => setStep({ kind: 'deleted', restoreError: true }),
          { kind: 'deleted', restoreError: false },
        )
      }
    />
  );
}
