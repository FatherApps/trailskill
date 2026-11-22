import type { RelinkRequest } from '../data/athleteRelink';

// Synthetic requests of a family, one per state.
export const relinkRequestsFixture: RelinkRequest[] = [
  { id: 'r1', createdAt: '2026-11-22T10:00:00Z', status: 'pending', schoolName: 'Escuela Norte', resolvedAt: null, movedCount: null },
  { id: 'r2', createdAt: '2026-11-20T15:30:00Z', status: 'approved', schoolName: 'Club Aguas Claras', resolvedAt: '2026-11-21T09:00:00Z', movedCount: 12 },
  { id: 'r3', createdAt: '2026-11-18T08:15:00Z', status: 'rejected', schoolName: 'Escuela del Sur', resolvedAt: '2026-11-19T11:00:00Z', movedCount: 0 },
];

export const relinkRequestsLongTextFixture: RelinkRequest[] = [
  {
    id: 'r4',
    createdAt: '2026-11-22T10:00:00Z',
    status: 'approved',
    schoolName: 'Escuela Deportiva Internacional de Natación y Deportes Acuáticos de la Costa Atlántica',
    resolvedAt: '2026-11-22T12:00:00Z',
    movedCount: 1,
  },
];
