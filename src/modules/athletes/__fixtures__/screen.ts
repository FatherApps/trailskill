import type { AthleteProfileContent } from '../screens/AthleteProfileScreen';
import { historyResults } from './history';
import { eventFixture as ev, personalBestFixture as pb, profileFixture as pf } from './profile';

const noop = () => {};

// A whole synthetic profile for the screen: fictional athlete, school and dates.
export const profileContentFixture: AthleteProfileContent = {
  header: {
    name: pf.name,
    category: pf.category,
    schools: pf.schools.slice(0, 1),
    schoolId: pf.schools[0].id,
    authorization: 'valid',
    updatedMinutesAgo: 5,
  },
  event: {
    strokes: ev.strokes,
    distances: ev.distances,
    pools: ev.pools,
    value: ev.value,
    onChange: noop,
  },
  personalBest: {
    stroke: pb.stroke,
    distance: pb.distance,
    pool: pb.pool,
    best: pb.best,
    improvement: pb.improvement,
    kind: 'competition',
    date: pb.date,
  },
  history: historyResults,
};

// The date the offline banner says the stored data is from.
export const storedOnFixture = '2026-10-23';
