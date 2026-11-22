import type { SchoolRelinkRequest } from '../../athletes';
import type { AthleteAuthorizations, SharingRequest } from '../components/AuthorizationList';

// Synthetic data for the development gallery and the tests: fictional people and schools.
export const authorizationsFixture: AthleteAuthorizations[] = [
  {
    id: 'a1',
    athlete: 'Lucía Ramírez',
    initials: 'LR',
    color: 'athlete-1',
    guardian: 'Paula Gómez',
    purposes: { record: 'valid', import: 'valid', share: 'pending' },
    canResend: true,
  },
  {
    id: 'a2',
    athlete: 'Mateo Castro',
    initials: 'MC',
    color: 'athlete-2',
    guardian: 'Camila Torres',
    purposes: { record: 'valid', import: 'withdrawn', share: 'valid' },
    canResend: true,
  },
  {
    id: 'a3',
    athlete: 'Sara Peña',
    initials: 'SP',
    color: 'athlete-3',
    guardian: 'Camilo Peña',
    purposes: { record: 'pending', import: 'pending', share: 'pending' },
    canResend: true,
  },
  {
    id: 'a4',
    athlete: 'Julián Ortiz',
    initials: 'JO',
    color: 'athlete-4',
    guardian: 'Luz Marina Ortiz',
    purposes: { record: 'valid', import: 'valid', share: 'valid' },
    canResend: true,
  },
];

export const longTextAuthorizationFixture: AthleteAuthorizations = {
  id: 'a5',
  athlete: 'María Fernanda de los Ángeles Restrepo Villegas',
  initials: 'MR',
  color: 'athlete-2',
  guardian: 'Luz Marina Villegas de Restrepo',
  purposes: { record: 'pending', import: 'withdrawn', share: 'pending' },
  canResend: true,
};

export const sharingRequestsFixture: SharingRequest[] = [
  { id: 's1', school: 'Escuela Tiburones', requestedOn: '2026-10-22', status: 'pending' },
  { id: 's2', school: 'Club Náutico Olas de la Costa Atlántica', requestedOn: '2026-10-24', status: 'approved' },
];

// Synthetic relink requests of families, one per state (names are made up).
export const relinkRequestsFixture: SchoolRelinkRequest[] = [
  { id: 'l1', createdAt: '2026-11-22T10:00:00Z', status: 'pending', athleteFirstName: 'Ana', athleteLastName: 'Marín', timesCount: 12, resolvedAt: null, movedCount: null },
  { id: 'l2', createdAt: '2026-11-21T15:30:00Z', status: 'approved', athleteFirstName: 'Luis', athleteLastName: 'Pérez', timesCount: 0, resolvedAt: '2026-11-21T18:00:00Z', movedCount: 7 },
  { id: 'l3', createdAt: '2026-11-19T08:15:00Z', status: 'rejected', athleteFirstName: 'Sara', athleteLastName: 'Gómez', timesCount: 0, resolvedAt: '2026-11-20T09:00:00Z', movedCount: 0 },
];

export const relinkRequestsLongTextFixture: SchoolRelinkRequest[] = [
  {
    id: 'l4',
    createdAt: '2026-11-22T10:00:00Z',
    status: 'pending',
    athleteFirstName: 'María Fernanda de los Ángeles',
    athleteLastName: 'Restrepo Villegas de la Hoz',
    timesCount: 1,
    resolvedAt: null,
    movedCount: null,
  },
];
