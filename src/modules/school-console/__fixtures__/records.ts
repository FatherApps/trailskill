import type { RecordRow } from '../components/RecordTable';

// Synthetic data for the development gallery and the tests: fictional people, no real organizations.
export const recordCategoryFixture = 'Infantil B';

// One best mark per event and pool, as the caller would supply them. Pecho 50 has no mark yet.
export const recordsFixture: RecordRow[] = [
  { id: 'r1', pool: 'SCM', event: 'Libre 50', time: 3391, athlete: 'Mateo Castro', date: '2026-10-18' },
  { id: 'r2', pool: 'SCM', event: 'Espalda 50', time: 4108, athlete: 'Lucía Ramírez', date: '2026-10-02' },
  { id: 'r3', pool: 'SCM', event: 'Pecho 50', time: null, athlete: null, date: null },
  { id: 'r4', pool: 'SCM', event: 'Libre 100', time: 7966, athlete: 'Lucía Ramírez', date: '2025-03-12', source: 'FEDNAT' },
  { id: 'r5', pool: 'LCM', event: 'Libre 50', time: 3482, athlete: 'Lucía Ramírez', date: '2026-09-20' },
  { id: 'r6', pool: 'LCM', event: 'Libre 100', time: 7510, athlete: 'Julián Ortiz', date: '2026-08-30' },
];

export const longTextRecordFixture: RecordRow = {
  id: 'r7',
  pool: 'SCM',
  event: 'Combinado individual 200',
  time: 129660,
  athlete: 'María Fernanda de los Ángeles Restrepo Villegas',
  date: '2026-10-25',
  source: 'Asociación Departamental de Natación',
};

export const recordsUpdatedMinutesAgo = 2;
