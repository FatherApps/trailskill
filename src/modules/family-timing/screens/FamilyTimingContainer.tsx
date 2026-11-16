import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '../../../core/i18n';
import { usePreferences } from '../../../core/preferences';
import { distances, pools, strokes, type DistanceCode, type PoolCode, type StrokeCode } from '../../../core/sport';
import { useRecordSyncStates } from '../../../core/sync';
import { formatMillis, formatTime } from '../../../core/time';
import type { ChipRowOption } from '../../../core/ui';
import { athleteDisplay, formatDate, type SchoolAthlete } from '../../athletes';
import {
  buttonAction,
  keyName,
  nanosFromSeconds,
  timingButton,
  useTimingButtons,
  type ButtonAction,
  type ButtonConfig,
  type ButtonPress,
  type ButtonTarget,
  type TimingButtonPort,
} from '../../timing';
import {
  FAMILY_MEASUREMENTS_TABLE,
  type FamilyMeasurement,
  type FamilyMeasurementRepository,
  type FamilySessionType,
} from '../data/familyMeasurements';
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
import { lapsFor } from '../domain/laps';
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
import '../i18n';

const KEEP_AWAKE_TAG = 'family-timing';

export type FamilyTimingContainerProps = {
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
  // Changes when the device synced: requests and moved times arrive by sync, so the lists read again.
  syncKey?: number;
  // Remembers that the notice was seen, so it shows on the first visit only. Without it the notice always shows.
  notice?: FamilyTimingNoticeStore;
};

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
};
const initialSetup: Setup = {
  mode: 'individual',
  swimmers: MIN_SWIMMERS,
  stroke: strokes[0].code,
  distance: distances[1].code,
  pool: null,
  sessionType: 'training',
  competition: '',
};

// A lane of a series once timed: who swam it (null: not given to a swimmer yet) and the stroke.
type Lane = { athleteId: string | null; stroke: StrokeCode };

// The chip of the times not given to a swimmer yet. Ids are UUIDs, so it never matches an athlete.
const UNASSIGNED = 'unassigned';
const swimmerCounts = Array.from({ length: MAX_SWIMMERS - MIN_SWIMMERS + 1 }, (_, i) => String(MIN_SWIMMERS + i));

type Step =
  | { kind: 'list' }
  | { kind: 'setup' }
  | { kind: 'stopwatch'; saveError: boolean }
  | { kind: 'series' }
  | { kind: 'series_assign'; lanes: Lane[]; saveError: boolean }
  | { kind: 'official'; id: string; text: string; invalid: boolean }
  // Picking which imported official result goes with a competition time (#974).
  | { kind: 'choose_official'; id: string; saveError: boolean }
  | { kind: 'edit'; id: string; stroke: StrokeCode; athleteId: string | null; confirmingDelete: boolean; saveError: boolean }
  | { kind: 'deleted'; restoreError: boolean }
  // One saved time with everything known about it (#1002).
  | { kind: 'detail'; id: string }
  // Sending a time with the other swimmer's code: `found` is the short name once the code was looked up.
  | { kind: 'send'; id: string; code: string; found: string | null; error: FamilyTransferErrorCode | null; busy: boolean };

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

const eventLabel = (m: { stroke: string; distance: string; pool: string }) =>
  `${t(`sport.stroke.${m.stroke}`)} ${t(`sport.distance.${m.distance}`)} · ${t(`sport.pool.${m.pool}`)}`;

// A series has one distance and pool; each swimmer's stroke is chosen after the arrivals.
const seriesEventLabel = (m: { distance: string; pool: string }) => `${t(`sport.distance.${m.distance}`)} · ${t(`sport.pool.${m.pool}`)}`;

// Container: reads and writes the guardian's own times (kept on the server for them), and runs the stopwatch.
export function FamilyTimingContainer(props: FamilyTimingContainerProps) {
  const { userId, athletes, repository, onBack, imports, sourceNames = {}, buttons = timingButton, transfers, shareCodes, syncKey, notice } = props;
  const now = props.now ?? buttons.now;
  const { preferences } = usePreferences();
  const buttonPrefs = preferences.timingButtons;
  const precision = preferences.timePrecision;
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
  // The swimmer the list reads and a new time goes to; null for "Sin asignar".
  const athleteOfSelected = selectedId === UNASSIGNED ? null : selectedId;
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
  const [series, setSeries] = useState<FamilySeries>(() => newFamilySeries(MIN_SWIMMERS));
  const [tick, setTick] = useState(0);
  const saving = useRef(false);
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

  // A key press acts on the stopwatch as it is at that instant, not as it was at the last render.
  const laps = setup.pool ? lapsFor(setup.distance, setup.pool) : 1;
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
      latestStopwatch.current = action === 'start' ? startAt(sw, at) : action === 'split' ? splitAt(sw, at, laps) : stopAt(sw, at);
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

  const sentByMeasurement = useMemo(
    () => new Map(sent.filter((t) => !settled.includes(t.id)).map((t) => [t.measurementId, t])),
    [sent, settled],
  );
  const cardOf = useCallback(
    (m: FamilyMeasurement, match: OfficialMatch | undefined): FamilyCard => {
      const day = localDay(m.capturedAt);
      const date = formatDate(day, 'short') ?? day;
      const type = t(`family_timing.session_type.${m.sessionType}`);
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
        sentTo: sentByMeasurement.get(m.id)?.athleteShortName ?? null,
      };
    },
    [format, sourceNames, sentByMeasurement],
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
      { label: t('family_timing.detail.when'), value: `${formatDate(day, 'long') ?? day} · ${clock}` },
      { label: t('family_timing.detail.session'), value: t(`family_timing.session_type.${m.sessionType}`) },
      ...(m.competition ? [{ label: t('family_timing.detail.competition'), value: m.competition }] : []),
      { label: t('family_timing.detail.event'), value: eventLabel(m) },
    ];
    const laps = lapRows(m.splits, m.millis, m.splits.length > 0).map(({ lap, total }) => ({ lap: formatLap(lap), total: formatLap(total) }));
    return { card, rows, laps };
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
  async function answer(id: string, write: (id: string) => Promise<void>) {
    if (saving.current) return;
    saving.current = true;
    setAnswerError(null);
    try {
      await write(id);
      setSettled((current) => [...current, id]);
      setReload((n) => n + 1);
    } catch (error) {
      setAnswerError(error instanceof FamilyTransferError ? error.code : 'failed');
    } finally {
      saving.current = false;
    }
  }

  async function lookUpCode() {
    if (step.kind !== 'send' || !shareCodes || !step.code.trim()) return;
    setStep({ ...step, busy: true, error: null, found: null });
    try {
      const name = await shareCodes.find(step.code.trim());
      setStep((s) => (s.kind === 'send' ? { ...s, busy: false, found: name, error: name ? null : 'unknown_code' } : s));
    } catch (error) {
      const code: FamilyTransferErrorCode = error instanceof Error && error.name === 'TooManyShareCodeLookupsError' ? 'too_many_attempts' : 'failed';
      setStep((s) => (s.kind === 'send' ? { ...s, busy: false, error: code } : s));
    }
  }

  async function sendTime() {
    if (step.kind !== 'send' || !transfers || !step.found || saving.current) return;
    saving.current = true;
    setStep({ ...step, busy: true, error: null });
    try {
      await transfers.send(step.id, step.code.trim());
      setStep({ kind: 'list' });
      setReload((n) => n + 1);
    } catch (error) {
      const code = error instanceof FamilyTransferError ? error.code : 'failed';
      setStep((s) => (s.kind === 'send' ? { ...s, busy: false, error: code } : s));
    } finally {
      saving.current = false;
    }
  }

  const goToList = () => {
    setStep({ kind: 'list' });
    setStopwatch(idleFamilyStopwatch);
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

  async function save() {
    if (saving.current || stopwatch.status !== 'stopped' || !selectedId || !setup.pool) return;
    saving.current = true;
    const measurement: FamilyMeasurement = {
      id: randomUUID(),
      athleteId: athleteOfSelected,
      createdBy: userId,
      stroke: setup.stroke,
      distance: setup.distance,
      pool: setup.pool,
      sessionType: setup.sessionType,
      competition: setup.sessionType === 'competition' && setup.competition.trim() ? setup.competition.trim() : null,
      capturedAt: new Date().toISOString(),
      millis: finalMillis(stopwatch),
      splits: splitMillis(stopwatch),
      officialMillis: null,
      officialSetAt: null,
    };
    try {
      await repository.add(measurement);
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
    return { value: a.id, label: shortName, dot: { initials, color } };
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
        laps: lapRows(splitMillis(stopwatch), finalMillis(stopwatch), laps > 1).map(({ lap, total }) => ({ lap: formatLap(lap), total: formatLap(total) })),
        lapProgress:
          laps > 1 && stopwatch.status === 'running'
            ? t('family_timing.stopwatch.lap_progress', { current: stopwatch.splitMarks.length + 1, total: laps })
            : null,
        hasLaps: laps > 1,
        event: eventLabel({ ...setup, pool: setup.pool ?? '' }),
        noTime: stopwatch.status === 'stopped' && finalMillis(stopwatch) === null,
        buttonsHint: keys.active ? buttonsHint(buttonPrefs.startKey, buttonPrefs.splitKey, keys.keyboards[0]?.name) : null,
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
            // "Sin asignar" is offered for a time that has no swimmer yet, so it can stay there.
            athlete: {
              options: card.unassigned ? [...athleteOptions, unassignedOption] : athleteOptions,
              value: step.athleteId ?? UNASSIGNED,
            },
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
          },
        }
      : listView();
  }
  else view = listView();

  return (
    <FamilyTimingScreen
      view={view}
      athletes={chips.map(({ value, label, dot }) => ({ id: value, name: label, dot }))}
      selectedId={selectedId}
      onSelectAthlete={setChosenId}
      onBack={onBack}
      onRetry={() => setReload((n) => n + 1)}
      onNew={() => setStep({ kind: 'setup' })}
      onSetupChange={(field, value) =>
        setSetup((current) => (field === 'swimmers' ? { ...current, swimmers: Number(value) } : { ...current, [field]: value }))
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
      onSplit={() => setStopwatch((sw) => splitAt(sw, now(), laps))}
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
        if (m) setStep({ kind: 'edit', id, stroke: m.stroke, athleteId: m.athleteId, confirmingDelete: false, saveError: false });
      }}
      onEditChange={(field, value) =>
        setStep((s) =>
          s.kind === 'edit'
            ? { ...s, saveError: false, ...(field === 'stroke' ? { stroke: value as StrokeCode } : { athleteId: value === UNASSIGNED ? null : value }) }
            : s,
        )
      }
      onSaveEdit={() => {
        if (step.kind !== 'edit') return;
        const m = loaded.status === 'ready' ? loaded.measurements.find((x) => x.id === step.id) : undefined;
        if (!m) return;
        const changes = {
          ...(step.stroke !== m.stroke ? { stroke: step.stroke } : {}),
          ...(step.athleteId !== m.athleteId ? { athleteId: step.athleteId } : {}),
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
      onSendCode={(code) => setStep((s) => (s.kind === 'send' ? { ...s, code, found: null, error: null } : s))}
      onLookUpCode={lookUpCode}
      onSendTime={sendTime}
      onWithdraw={(measurementId) => {
        const transfer = sentByMeasurement.get(measurementId);
        if (transfers && transfer) answer(transfer.id, transfers.withdraw);
      }}
      onAccept={(id) => transfers && answer(id, transfers.accept)}
      onReject={(id) => transfers && answer(id, transfers.reject)}
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
