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

// The data of the reference screens (LSerieLlegadas, LSerieAsignar, LSerieMovil): five swimmers in the water, three arrivals, two named.
const mockupAthletes: (SeriesAthlete & { bestTime: Hundredths })[] = [
  { id: 'm1', shortName: 'Tomás V.', initials: 'TV', detail: '', color: 'athlete-3', bestTime: 3105 },
  { id: 'm2', shortName: 'Mateo C.', initials: 'MC', detail: '', color: 'athlete-2', bestTime: 3391 },
  { id: 'm3', shortName: 'Lucía R.', initials: 'LR', detail: '', color: 'athlete-1', bestTime: 3482 },
  { id: 'm4', shortName: 'Sara P.', initials: 'SP', detail: '', color: 'athlete-4', bestTime: 3605 },
  { id: 'm5', shortName: 'Julián O.', initials: 'JO', detail: '', color: 'athlete-1', bestTime: 3647 },
];
const mockupTimes: Hundredths[] = [3105, 3391, 3522, 3610, 3748];

export const seriesFixture = {
  eventTitle: t('sport.stroke.FR') + ' ' + t('sport.distance.50m'),
  sessionLabel: t('timing.session_type.training'),
  mockup: {
    athletes: mockupAthletes,
    times: mockupTimes,
    // The wall-clock start of the series in the reference ("salida a las 7:14:02").
    startedAt: new Date(2026, 9, 25, 7, 14, 2).getTime(),
    clock: 3610 as Hundredths,
  },
  eventSubtitle: `${t('sport.stroke.FR')} ${t('sport.distance.50m')} · ${t('timing.session_type.training')}`,
  athletes,
  times,
  // Fixed clock values, so a screenshot of the series timing screen is still.
  clock: { empty: 0, still: 5670 },
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
