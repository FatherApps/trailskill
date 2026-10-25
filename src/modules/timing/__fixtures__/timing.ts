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

export const fixture = {
  athleteNames: ['Mateo C.', 'Lucía R.', 'Sara P.'],
  times,
  splits: [{ label: t('sport.distance.25m'), value: times.firstSplit }],
  setupScreen: {
    ...setupOptions,
    subtitle: 'Grupo B · Martes 7:00',
  },
  stopwatchScreen: {
    athleteName: 'Mateo C.',
    position: 1,
    total: 4,
    eventSubtitle: `${t('sport.stroke.FR')} ${t('sport.distance.50m')} · ${t('timing.session_type.training')}`,
    state: 'ready' as const,
    elapsedHundredths: 0,
  },
};
