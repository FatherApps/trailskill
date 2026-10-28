import type { MarksView } from '../screens/MarksScreen';

// Synthetic athletes and marks: fictional names, no real people or organizations. Times are in hundredths of a second.
const athletes: Extract<MarksView, { kind: 'data' }>['athletes'] = [
  { id: 'fx-1', name: 'Lucía R.', initials: 'LR', color: 'athlete-3' },
  { id: 'fx-2', name: 'Tomás R.', initials: 'TR', color: 'athlete-2' },
];

const data = { kind: 'data' as const, athletes, selectedId: 'fx-1', firstName: 'Lucía', pool: 'SCM' as const };

export const marksFixture: MarksView = {
  ...data,
  cards: [
    { id: 'FR-50m', event: 'Libre 50', time: 3482, origin: 'competition', date: '2026-10-18' },
    { id: 'FR-100m', event: 'Libre 100', time: 7966, origin: 'competition', date: '2025-08-23' },
    { id: 'BK-50m', event: 'Espalda 50', time: 4108, origin: 'training', date: '2026-10-02' },
    { id: 'BK-100m', event: 'Espalda 100', time: null },
    { id: 'BR-50m', event: 'Pecho 50', time: 4731, origin: 'competition', date: '2026-08-23' },
    { id: 'FL-50m', event: 'Mariposa 50', time: 3955, origin: 'competition', date: '2026-08-23' },
    { id: 'IM-100m', event: 'Combinado 100', time: null },
  ],
};

// The long pool lists no empty IM 100 row.
export const marksLongPoolFixture: MarksView = {
  ...data,
  pool: 'LCM',
  cards: [
    { id: 'FR-50m', event: 'Libre 50', time: 3601, origin: 'competition', date: '2026-09-12' },
    { id: 'FR-100m', event: 'Libre 100', time: null },
    { id: 'BK-50m', event: 'Espalda 50', time: null },
    { id: 'BK-100m', event: 'Espalda 100', time: null },
    { id: 'BR-50m', event: 'Pecho 50', time: null },
    { id: 'FL-50m', event: 'Mariposa 50', time: null },
  ],
};

export const marksLongTextFixture: MarksView = {
  ...data,
  athletes: [{ id: 'fx-5', name: 'María de los Ángeles P.', initials: 'MP', color: 'athlete-1' }, ...athletes],
  selectedId: 'fx-5',
  firstName: 'María de los Ángeles',
  cards: [
    { id: 'FR-50m', event: 'Libre 50', time: 123456, origin: 'training', date: '2026-10-18' },
    { id: 'IM-100m', event: 'Combinado 100', time: null },
  ],
};
