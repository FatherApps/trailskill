import type { DistanceCode, PoolCode, StrokeCode } from '../../../core/sport';
import type { RecordRow } from '../components/RecordTable';
import { eventLabel } from '../components/eventLabel';

// Synthetic data for the development gallery and the tests: fictional people, no real organizations.
export const recordCategoryFixture = 'Categoría B';

// The event text is built from the stroke and the distance, so the two cannot disagree (see eventLabel).
const record = (
  id: string,
  pool: PoolCode,
  stroke: StrokeCode,
  distance: DistanceCode,
  mark: Pick<RecordRow, 'time' | 'athlete' | 'date' | 'source'>,
): RecordRow => ({ id, pool, event: eventLabel(stroke, distance), stroke, ...mark });

// One best mark per event and pool, as the caller would supply them. Pecho 50 has no mark yet.
export const recordsFixture: RecordRow[] = [
  record('r1', 'SCM', 'FR', '50m', { time: 3391, athlete: 'Mateo Castro', date: '2026-10-18' }),
  record('r2', 'SCM', 'BK', '50m', { time: 4108, athlete: 'Lucía Ramírez', date: '2026-10-02' }),
  record('r3', 'SCM', 'BR', '50m', { time: null, athlete: null, date: null }),
  record('r4', 'SCM', 'FR', '100m', { time: 7966, athlete: 'Lucía Ramírez', date: '2025-03-12', source: 'FEDNAT' }),
  record('r5', 'LCM', 'FR', '50m', { time: 3482, athlete: 'Lucía Ramírez', date: '2026-09-20' }),
  record('r6', 'LCM', 'FR', '100m', { time: 7510, athlete: 'Julián Ortiz', date: '2026-08-30' }),
];

// The long event name is on purpose (the catalog says only "Combinado"): the fixture test checks it still starts with its stroke.
export const longTextRecordFixture: RecordRow = {
  ...record('r7', 'SCM', 'IM', '200m', {
    time: 129660,
    athlete: 'María Fernanda de los Ángeles Restrepo Villegas',
    date: '2026-10-25',
    source: 'Asociación Departamental de Natación',
  }),
  event: 'Combinado individual 200',
};

export const recordsUpdatedMinutesAgo = 2;
