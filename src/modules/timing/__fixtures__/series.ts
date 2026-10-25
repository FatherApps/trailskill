import { t } from '../../../core/i18n';
import type { Hundredths } from '../../../core/time';
import '../i18n';
import { arrivals, assignHighlighted, press, readySeries, reopen, type Series } from '../domain/series';

// Synthetic data for the development gallery and the tests. Names are fictional.
export type SeriesAthlete = {
  id: string;
  shortName: string;
  initials: string;
  detail: string;
  color: 'athlete-1' | 'athlete-2' | 'athlete-3' | 'athlete-4';
};

const athletes: SeriesAthlete[] = [
  { id: 'a1', shortName: 'Mateo C.', initials: 'MC', detail: 'Carril 1', color: 'athlete-1' },
  { id: 'a2', shortName: 'Lucía R.', initials: 'LR', detail: 'Carril 2', color: 'athlete-2' },
  { id: 'a3', shortName: 'Sara P.', initials: 'SP', detail: 'Carril 3', color: 'athlete-3' },
  { id: 'a4', shortName: 'Tomás V.', initials: 'TV', detail: 'Carril 4', color: 'athlete-4' },
];

const times: Hundredths[] = [3105, 3391, 3522, 3647];

const nanos = (hundredths: Hundredths) => BigInt(hundredths) * 10_000_000n;

// Built with the real series rules, so a snapshot can never show a state the domain would not produce.
const timed: Series = times.reduce((series, time) => press(series, nanos(time)), press(readySeries, 0n));

function assignInOrder(series: Series, count: number): Series {
  return athletes.slice(0, count).reduce((current, athlete) => {
    const result = assignHighlighted(current, athlete.id);
    return result.ok ? result.series : current;
  }, series);
}

const partial = assignInOrder(timed, 2);
const all = assignInOrder(timed, 4);
// The third time was reopened and stays "por asignar".
const pending = reopen(all, 3);

export const seriesFixture = {
  eventSubtitle: `${t('sport.stroke.FR')} ${t('sport.distance.50m')} · ${t('timing.session_type.training')}`,
  athletes,
  times,
  // The same arrivals, in the shape the list receives them.
  arrivals: arrivals(timed).map(({ position, time }) => ({ id: `arrival-${position}`, time })),
  // Many arrivals, to see the list grow.
  manyArrivals: Array.from({ length: 8 }, (_, index) => ({
    id: `arrival-${index + 1}`,
    time: 3105 + index * 187,
  })),
  // The series themselves, for tests of the domain rules over these states.
  series: { none: timed, partial, all, pending },
  snapshots: {
    none: arrivals(timed),
    partial: arrivals(partial),
    all: arrivals(all),
    pending: arrivals(pending),
  },
};
