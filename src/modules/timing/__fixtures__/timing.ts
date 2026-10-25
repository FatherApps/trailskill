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

const times: Record<'running' | 'final' | 'bestTime' | 'firstSplit', Hundredths> = {
  running: 2150,
  final: 3391,
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
  { id: 'r1', shortName: 'Mateo C.', initials: 'MC', color: 'athlete-1', time: 3391, syncState: 'on_device' },
  { id: 'r2', shortName: 'Lucía R.', initials: 'LR', color: 'athlete-2', time: 3522, syncState: 'not_sent' },
  { id: 'r3', shortName: 'Tomás V.', initials: 'TV', color: 'athlete-4', time: 3105, syncState: 'synced' },
  { id: 'r4', shortName: 'Sara P.', initials: 'SP', color: 'athlete-3', time: null, syncState: 'sending' },
] as const;

export const fixture = {
  athleteNames: ['Mateo C.', 'Lucía R.', 'Sara P.'],
  times,
  splits: [{ label: t('sport.distance.25m'), value: times.firstSplit }],
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
