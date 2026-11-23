import { t } from '../../../core/i18n';
import { distances, pools, strokes } from '../../../core/sport';
import type { Hundredths } from '../../../core/time';
import '../i18n';

const option = ({ code, nameKey }: { code: string; nameKey: string }) => ({ value: code, label: t(nameKey) });

// Synthetic data for the development gallery and the tests. Names are fictional.
const setupOptions = {
  stroke: { options: strokes.slice(0, 4).map(option), value: 'FR' },
  distance: { options: distances.slice(0, 4).map(option), value: '50m' },
  pool: { options: pools.map(option), value: 'SCM' },
  sessionType: {
    options: [
      { value: 'training', label: t('timing.session_type.training') },
      { value: 'competition', label: t('timing.session_type.competition') },
    ],
    value: 'training',
  },
  source: {
    options: [
      { value: 'phone', label: t('timing.source.phone') },
      { value: 'external', label: t('timing.source.external') },
    ],
    value: 'phone',
  },
};

const times: Record<'running' | 'final' | 'slower' | 'bestTime' | 'firstSplit', Hundredths> = {
  running: 2150,
  final: 3391,
  slower: 3522,
  bestTime: 3482,
  firstSplit: 1640,
};

type Athlete = {
  id: string;
  shortName: string;
  initials: string;
  color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';
  bestTime: Hundredths | null;
  authorized: boolean;
};

const athletes: Athlete[] = [
  { id: 'a1', shortName: 'Mateo C.', initials: 'MC', color: 'athlete-1', bestTime: 3482, authorized: true },
  { id: 'a2', shortName: 'Lucía R.', initials: 'LR', color: 'athlete-2', bestTime: 3482, authorized: true },
  { id: 'a3', shortName: 'Sara P.', initials: 'SP', color: 'athlete-3', bestTime: null, authorized: true },
];

const records = [
  { id: 'r1', shortName: 'Mateo C.', initials: 'MC', color: 'athlete-1', time: 3391, personalBest: 3482, syncState: 'on_device' },
  { id: 'r2', shortName: 'Lucía R.', initials: 'LR', color: 'athlete-2', time: 3522, personalBest: 3482, syncState: 'not_sent' },
  { id: 'r3', shortName: 'Tomás V.', initials: 'TV', color: 'athlete-4', time: 3105, syncState: 'synced' },
  { id: 'r4', shortName: 'Sara P.', initials: 'SP', color: 'athlete-3', time: null, syncState: 'sending' },
] as const;

export const fixture = {
  athleteNames: ['Mateo C.', 'Lucía R.', 'Sara P.'],
  times,
  splits: [{ label: t('sport.distance.25m'), value: times.firstSplit }],
  // A 100 m in a 25 m pool with free marks: the last two have no meters, the way the coach left them.
  freeMarks: [
    { label: t('timing.stopwatch.split_meters', { label: 'Parcial 1', meters: 25 }), value: 1650 },
    { label: t('timing.stopwatch.split_meters', { label: 'Parcial 2', meters: 50 }), value: 3420 },
    { label: t('timing.stopwatch.split_meters', { label: 'Parcial 3', meters: 75 }), value: 5260 },
    { label: 'Parcial 4', value: 6980 },
    { label: 'Parcial 5', value: 8120 },
  ],
  meterFields: [
    { label: 'Parcial 1 · 16,50', meters: 25 },
    { label: 'Parcial 2 · 34,20', meters: 50 },
    { label: 'Parcial 3 · 52,60', meters: 75 },
    { label: 'Parcial 4 · 1:09,80', meters: null },
    { label: 'Parcial 5 · 1:21,20', meters: null },
  ],
  setupScreen: {
    ...setupOptions,
    subtitle: 'Grupo B · Martes 7:00',
    athletes,
    selectedCount: 3,
    groupCount: 12,
  },
  athletesWithSkipped: athletes.map((athlete) =>
    athlete.id === 'a3' ? { ...athlete, authorized: false } : athlete,
  ),
  // A swimmer the school ended: listed as «Dado de baja», not chosen (issue 1436).
  athletesWithEnded: athletes.map((athlete) =>
    athlete.id === 'a3' ? { ...athlete, authorized: false, skipReason: 'ended' as const } : athlete,
  ),
  summaryScreen: { subtitle: 'Grupo B · Libre 50 m', records: [...records] },
  stopwatchScreen: {
    athleteName: 'Mateo C.',
    position: 1,
    total: 4,
    eventSubtitle: `${t('sport.stroke.FR')} ${t('sport.distance.50m')} · ${t('timing.session_type.training')}`,
    state: 'ready' as const,
    elapsedHundredths: 0,
  },
};
